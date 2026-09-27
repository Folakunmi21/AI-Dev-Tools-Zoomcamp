"""End-to-end tests for the services started by docker-compose.yaml.

Run explicitly from the repository root (or from ``backend/``):

    uv run pytest tests/integration/test_compose.py

The fixture owns an isolated Compose project and removes its containers and
volume after the test session, so it does not modify a developer's normal
Compose stack.
"""

from __future__ import annotations

import os
import socket
import subprocess
import time
from pathlib import Path
from uuid import uuid4

import httpx
import pytest


ROOT = Path(__file__).resolve().parents[3]
COMPOSE_FILE = ROOT / "docker-compose.yaml"
def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def compose(project: str, *args: str, env: dict[str, str] | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    command_env = os.environ.copy()
    if env:
        command_env.update(env)
    return subprocess.run(
        ["docker", "compose", "-p", project, "-f", str(COMPOSE_FILE), *args],
        cwd=ROOT,
        env=command_env,
        check=check,
        text=True,
        capture_output=True,
    )


@pytest.fixture(scope="module")
def api() -> httpx.Client:
    project = f"evenly-integration-{uuid4().hex[:10]}"
    compose_env = {"POSTGRES_HOST_PORT": str(free_port()), "APP_HOST_PORT": str(free_port())}
    base_url = f"http://127.0.0.1:{compose_env['APP_HOST_PORT']}"
    try:
        compose(project, "up", "--build", "-d", env=compose_env)
    except FileNotFoundError as exc:
        pytest.fail("Docker is required for Compose integration tests.")
    except subprocess.CalledProcessError as exc:
        compose(project, "down", "-v", env=compose_env, check=False)
        pytest.fail(f"Could not start Docker Compose services:\n{exc.stderr}")

    client = httpx.Client(base_url=base_url, timeout=10)
    deadline = time.monotonic() + 90
    last_error = "the app did not become ready"
    while time.monotonic() < deadline:
        try:
            response = client.get("/api/auth/session")
            if response.status_code == 200:
                break
            last_error = f"HTTP {response.status_code}: {response.text}"
        except httpx.HTTPError as exc:
            last_error = str(exc)
        time.sleep(1)
    else:
        logs = compose(project, "logs", "app", env=compose_env, check=False)
        compose(project, "down", "-v", env=compose_env, check=False)
        client.close()
        pytest.fail(f"Compose app was not ready: {last_error}\n{logs.stdout}")

    try:
        yield client
    finally:
        client.close()
        compose(project, "down", "-v", env=compose_env, check=False)


def register(client: httpx.Client, suffix: str) -> tuple[str, str]:
    email = f"integration-{suffix}-{uuid4().hex[:8]}@example.com"
    response = client.post(
        "/api/auth/register",
        json={"name": f"Integration {suffix}", "email": email, "password": "password123"},
    )
    assert response.status_code == 200, response.text
    return email, response.json()["access_token"]


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_http_stack_serves_frontend_and_persists_registered_users(api: httpx.Client):
    frontend = api.get("/")
    assert frontend.status_code == 200
    assert "Evenly" in frontend.text

    email, token = register(api, "restart")
    assert api.get("/api/auth/session", headers=bearer(token)).json()["user"]["email"] == email

    # The account must survive separate HTTP requests through the app/database stack.
    login = api.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert login.status_code == 200


def test_auth_boundaries_and_validation_are_enforced(api: httpx.Client):
    assert api.get("/api/notifications").status_code == 401
    invalid = api.post("/api/auth/register", json={"name": "", "email": "bad", "password": "short"})
    assert invalid.status_code == 422

    _, token = register(api, "validation")
    unauthenticated = api.post("/api/groups", json={"name": "No token"})
    assert unauthenticated.status_code == 401
    invalid_group = api.post("/api/groups", headers=bearer(token), json={"name": "   "})
    assert invalid_group.status_code == 422


def test_group_expense_balance_and_settlement_flow_over_postgres(api: httpx.Client):
    _, token = register(api, "expenses")
    headers = bearer(token)
    group = api.post("/api/groups", headers=headers, json={"name": "Compose dinner", "memberNames": ["Bola"]})
    assert group.status_code == 201, group.text
    group_id = group.json()["id"]

    detail = api.get(f"/api/groups/{group_id}", headers=headers).json()
    payer = next(member["id"] for member in detail["members"] if member["role"] == "admin")
    participant = next(member["id"] for member in detail["members"] if member["id"] != payer)
    expense = api.post(
        "/api/expenses",
        headers=headers,
        json={
            "groupId": group_id,
            "description": "Dinner",
            "totalAmount": 1000,
            "expenseDate": "2026-09-17",
            "splitMethod": "equal",
            "payers": [{"memberId": payer, "amount": 1000}],
            "participants": [{"memberId": payer}, {"memberId": participant}],
        },
    )
    assert expense.status_code == 201, expense.text
    debt = api.get(f"/api/groups/{group_id}", headers=headers).json()["balances"]["debts"][0]
    settlement = api.post(
        "/api/settlements",
        headers=headers,
        json={"groupId": group_id, "fromMemberId": debt["fromMemberId"], "toMemberId": debt["toMemberId"], "amount": debt["outstandingAmount"]},
    )
    assert settlement.status_code == 201
    assert settlement.json()["status"] == "paid"


def test_invite_notifications_budget_and_receipt_upload(api: httpx.Client):
    _, owner_token = register(api, "owner")
    guest_email, guest_token = register(api, "guest")
    owner_headers = bearer(owner_token)
    guest_headers = bearer(guest_token)

    group = api.post("/api/groups", headers=owner_headers, json={"name": "Invite flow"})
    group_id = group.json()["id"]
    invitation = api.post(f"/api/groups/{group_id}/invitations", headers=owner_headers, json={"email": guest_email})
    assert invitation.status_code == 204
    assert api.get("/api/notifications/unread-count", headers=guest_headers).json() == {"count": 1}
    invite = api.post(f"/api/groups/{group_id}/invite", headers=owner_headers).json()["token"]
    assert api.get(f"/api/invites/{invite}").json()["valid"] is True
    accepted = api.post(f"/api/invites/{invite}/accept", headers=guest_headers, json={"displayName": "Guest"})
    assert accepted.status_code == 200

    budget = api.post("/api/budgets", headers=owner_headers, json={"name": "Bills"}).json()
    item = api.post(f"/api/budgets/{budget['id']}/items", headers=owner_headers, json={"name": "Rent", "amount": 100000})
    assert item.json()["remainingAmount"] == 100000
    paid = api.patch(f"/api/budgets/{budget['id']}/items/{item.json()['items'][0]['id']}", headers=owner_headers, json={"isPaid": True})
    assert paid.json()["remainingAmount"] == 0

    receipt = api.post("/api/uploads/receipts", files={"file": ("receipt.png", b"png", "image/png")})
    assert receipt.status_code == 200
    assert receipt.json()["fileName"] == "receipt.png"
