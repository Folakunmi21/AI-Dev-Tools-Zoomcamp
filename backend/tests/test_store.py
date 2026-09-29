from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy.exc import IntegrityError

from app.models import Group, StoredUser
from app.store import Store, utcnow


ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def repository(tmp_path, monkeypatch) -> Store:
    database_url = f"sqlite:///{(tmp_path / 'persistence.db').as_posix()}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("SEED_DEMO_DATA", "false")
    config = Config(str(ROOT / "alembic.ini"))
    command.upgrade(config, "head")
    store = Store(database_url=database_url)
    store.reset()
    return store


def test_creates_one_record(repository: Store):
    group = Group(
        id="grp_created",
        kind="group",
        name="Created group",
        description="",
        ownerId="usr_ada",
        currency="NGN",
        inviteToken=None,
        createdAt=utcnow(),
        updatedAt=utcnow(),
    )
    unit = repository.begin_request()
    unit.data.groups[group.id] = group
    unit.commit()
    unit.close()

    assert repository.snapshot().groups[group.id].name == "Created group"


def test_updates_one_record_without_modifying_another(repository: Store):
    unit = repository.begin_request()
    unit.data.groups["grp_lagos"].name = "Updated Lagos"
    unit.commit()
    unit.close()

    snapshot = repository.snapshot()
    assert snapshot.groups["grp_lagos"].name == "Updated Lagos"
    assert snapshot.groups["grp_apartment"].name == "Apartment Expenses"


def test_deletes_one_record_without_deleting_another(repository: Store):
    unit = repository.begin_request()
    del unit.data.groups["grp_lagos"]
    unit.commit()
    unit.close()

    snapshot = repository.snapshot()
    assert "grp_lagos" not in snapshot.groups
    assert "grp_apartment" in snapshot.groups


def test_user_records_remain_isolated(repository: Store):
    unit = repository.begin_request()
    ada_budget = unit.data.budgets["bud_ada"] if unit.data.budgets.get("bud_ada") else None
    if ada_budget is None:
        from app.models import PersonalBudget

        unit.data.budgets["bud_ada"] = PersonalBudget(id="bud_ada", userId="usr_ada", name="Ada", totalAmount=0, paidAmount=0, remainingAmount=0, items=[])
        unit.data.budgets["bud_kunmi"] = PersonalBudget(id="bud_kunmi", userId="usr_kunmi", name="Kunmi", totalAmount=0, paidAmount=0, remainingAmount=0, items=[])
    unit.commit()
    unit.close()

    unit = repository.begin_request()
    unit.data.budgets["bud_ada"].name = "Ada updated"
    unit.commit()
    unit.close()

    snapshot = repository.snapshot()
    assert snapshot.budgets["bud_ada"].name == "Ada updated"
    assert snapshot.budgets["bud_kunmi"].name == "Kunmi"


def test_group_records_remain_isolated(repository: Store):
    unit = repository.begin_request()
    unit.data.expenses["exp_airbnb"].description = "Updated Airbnb"
    unit.commit()
    unit.close()

    snapshot = repository.snapshot()
    assert snapshot.expenses["exp_airbnb"].description == "Updated Airbnb"
    assert snapshot.expenses["exp_electricity"].description == "Electricity (September)"


def test_failed_transaction_rolls_back_prior_changes(repository: Store):
    unit = repository.begin_request()
    unit.data.groups["grp_lagos"].name = "Should roll back"
    unit.data.users["grp_lagos"] = StoredUser(
        id="grp_lagos",
        name="Invalid duplicate id",
        email="invalid@example.com",
        passwordHash="hash",
        createdAt=utcnow(),
        updatedAt=utcnow(),
    )
    with pytest.raises(IntegrityError):
        unit.commit()
    unit.rollback()
    unit.close()

    assert repository.snapshot().groups["grp_lagos"].name == "Lagos Trip"


def test_independent_concurrent_updates_do_not_overwrite_each_other(repository: Store):
    first = repository.begin_request()
    second = repository.begin_request()
    first.data.groups["grp_lagos"].name = "First update"
    second.data.groups["grp_apartment"].description = "Second update"

    first.commit()
    second.commit()
    first.close()
    second.close()

    snapshot = repository.snapshot()
    assert snapshot.groups["grp_lagos"].name == "First update"
    assert snapshot.groups["grp_apartment"].description == "Second update"


def test_concurrent_same_record_update_is_rejected(repository: Store):
    first = repository.begin_request()
    second = repository.begin_request()
    first.data.groups["grp_lagos"].name = "First update"
    second.data.groups["grp_lagos"].name = "Stale update"

    first.commit()
    with pytest.raises(RuntimeError, match="Concurrent update detected"):
        second.commit()
    second.rollback()
    first.close()
    second.close()

    assert repository.snapshot().groups["grp_lagos"].name == "First update"
