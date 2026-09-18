import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.store import store


@pytest.fixture(autouse=True)
def reset_store():
    # Each test starts with the useful demo dataset in the configured database.
    store.reset()


@pytest.fixture
def client():
    return TestClient(app)


def login(client, email="ada@evenly.app", password="password"):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    return body["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_seeded_session_and_dashboard(client):
    assert client.get("/api/auth/session").json() == {"user": None, "access_token": None, "token_type": None}
    token = login(client)
    dashboard = client.get("/api/dashboard", headers=auth(token))
    assert dashboard.status_code == 200
    assert dashboard.json()["groups"][0]["group"]["name"] == "Lagos Trip"


def test_passwords_are_hashed_and_protected_routes_require_bearer(client):
    assert store.data.users["usr_ada"].passwordHash != "password"
    assert client.post("/api/groups", json={"name": "Nope"}).status_code == 401
    assert client.get("/api/notifications").status_code == 401
    assert client.get("/api/groups/grp_lagos").status_code == 403


def test_group_expense_and_settlement_flow(client):
    token = login(client)
    headers = auth(token)
    created = client.post("/api/groups", headers=headers, json={"name": "Dinner", "memberNames": ["Bola"]})
    assert created.status_code == 201
    group_id = created.json()["id"]
    detail = client.get(f"/api/groups/{group_id}", headers=headers).json()
    ada_id = next(m["id"] for m in detail["members"] if m["userId"] == "usr_ada")
    other_id = next(m["id"] for m in detail["members"] if m["displayName"] == "Bola")
    expense = client.post("/api/expenses", headers=headers, json={"groupId": group_id, "description": "Rice", "totalAmount": 1000, "expenseDate": "2026-09-17", "splitMethod": "equal", "payers": [{"memberId": ada_id, "amount": 1000}], "participants": [{"memberId": ada_id}, {"memberId": other_id}]})
    assert expense.status_code == 201
    debt = client.get(f"/api/groups/{group_id}", headers=headers).json()["balances"]["debts"][0]
    paid = client.post("/api/settlements", headers=headers, json={"groupId": group_id, "fromMemberId": debt["fromMemberId"], "toMemberId": debt["toMemberId"], "amount": debt["outstandingAmount"]})
    assert paid.status_code == 201
    assert paid.json()["status"] == "paid"


def test_guest_quick_split_invite_preview_and_upload(client):
    quick = client.post("/api/quick-splits", json={"memberNames": ["Guest", "Friend"]})
    assert quick.status_code == 201
    preview = client.get("/api/invites/lagos-invite-demo")
    assert preview.json()["valid"] is True
    upload = client.post("/api/uploads/receipts", files={"file": ("receipt.png", b"png", "image/png")})
    assert upload.status_code == 200
    assert upload.json()["fileName"] == "receipt.png"


def test_notifications_can_be_read(client):
    token = login(client)
    headers = auth(token)
    assert client.get("/api/notifications/unread-count").json() == {"count": 0}
    assert client.get("/api/notifications/unread-count", headers=headers).json() == {"count": 1}
    notification_id = client.get("/api/notifications", headers=headers).json()[0]["id"]
    assert client.post(f"/api/notifications/{notification_id}/read", headers=headers).status_code == 204
    assert client.get("/api/notifications/unread-count", headers=headers).json() == {"count": 0}


def test_logout_revokes_bearer_token(client):
    token = login(client)
    headers = auth(token)
    assert client.post("/api/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/notifications", headers=headers).status_code == 401


def test_personal_budget_recalculates_when_items_are_paid(client):
    token = login(client)
    headers = auth(token)
    created = client.post("/api/budgets", headers=headers, json={"name": "September bills"})
    assert created.status_code == 201
    budget_id = created.json()["id"]

    first = client.post(f"/api/budgets/{budget_id}/items", headers=headers, json={"name": "Rent", "amount": 100000})
    second = client.post(f"/api/budgets/{budget_id}/items", headers=headers, json={"name": "Internet", "amount": 15000})
    assert first.json()["totalAmount"] == 100000
    assert second.json()["remainingAmount"] == 115000

    item_id = first.json()["items"][0]["id"]
    paid = client.patch(f"/api/budgets/{budget_id}/items/{item_id}", headers=headers, json={"isPaid": True})
    assert paid.status_code == 200
    assert paid.json()["paidAmount"] == 100000
    assert paid.json()["remainingAmount"] == 15000
