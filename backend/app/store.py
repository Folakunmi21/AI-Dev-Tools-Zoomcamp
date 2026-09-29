"""SQLAlchemy-backed persistence for the Evenly domain.

The routers continue to work with the existing Pydantic domain objects, while
this module handles serialization and database access in one place. The
database URL is configured with ``DATABASE_URL`` and defaults to SQLite.
"""
from __future__ import annotations

import os
from contextvars import ContextVar
from datetime import timedelta, datetime, timezone
from uuid import uuid4

from sqlalchemy import create_engine, delete, select, text
from sqlalchemy.orm import sessionmaker

from .db import Base, EntityRow
from .models import *


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:10]}"


ENTITY_FIELDS = {
    "users": ("user", StoredUser),
    "groups": ("group", Group),
    "members": ("member", GroupMember),
    "expenses": ("expense", Expense),
    "settlements": ("settlement", Settlement),
    "activities": ("activity", Activity),
    "notifications": ("notification", AppNotification),
    "budgets": ("budget", PersonalBudget),
}

_current_unit_of_work: ContextVar["UnitOfWork | None"] = ContextVar("evenly_unit_of_work", default=None)


class EntityCollection:
    """Request-scoped mapping backed by one entity kind in the database."""

    def __init__(self, unit_of_work: "UnitOfWork", kind: str, model_type):
        self.unit_of_work = unit_of_work
        self.kind = kind
        self.model_type = model_type
        self.models: dict[str, object] = {}
        self.originals: dict[str, dict | None] = {}
        self.deleted: set[str] = set()

    def _row_model(self, row: EntityRow):
        if row.id in self.models:
            return self.models[row.id]
        if self.model_type is None:
            value = row.payload["user_id"]
            self.models[row.id] = value
            self.originals.setdefault(row.id, dict(row.payload))
            return value
        model = self.model_type.model_validate(row.payload)
        self.models[row.id] = model
        self.originals.setdefault(row.id, model.model_dump(mode="json"))
        return model

    def get(self, entity_id: str, default=None):
        if entity_id in self.deleted:
            return default
        if entity_id in self.models:
            return self.models[entity_id]
        row = self.unit_of_work.session.scalar(
            select(EntityRow).where(EntityRow.id == entity_id, EntityRow.kind == self.kind)
        )
        return self._row_model(row) if row else default

    def __getitem__(self, entity_id: str):
        model = self.get(entity_id)
        if model is None:
            raise KeyError(entity_id)
        return model

    def __setitem__(self, entity_id: str, model) -> None:
        self.models[entity_id] = model
        self.originals.setdefault(entity_id, None)
        self.deleted.discard(entity_id)

    def __delitem__(self, entity_id: str) -> None:
        if self.get(entity_id) is None:
            raise KeyError(entity_id)
        self.deleted.add(entity_id)

    def values(self):
        rows = self.unit_of_work.session.scalars(
            select(EntityRow).where(EntityRow.kind == self.kind)
        ).all()
        values = [self._row_model(row) for row in rows if row.id not in self.deleted]
        persisted_ids = {row.id for row in rows}
        values.extend(
            model for entity_id, model in self.models.items()
            if entity_id not in persisted_ids and entity_id not in self.deleted
        )
        return values

    def __iter__(self):
        return iter(self.values())

    def pop(self, entity_id: str, default=None):
        model = self.get(entity_id, default)
        if model is not default:
            del self[entity_id]
        return model

    def flush(self) -> None:
        for entity_id in self.deleted:
            self.unit_of_work.session.execute(
                delete(EntityRow).where(EntityRow.id == entity_id, EntityRow.kind == self.kind)
            )

        for entity_id, model in self.models.items():
            if entity_id in self.deleted:
                continue
            payload = {"user_id": model} if self.model_type is None else model.model_dump(mode="json")
            original = self.originals.get(entity_id)
            if original is None:
                self.unit_of_work.session.add(EntityRow(id=entity_id, kind=self.kind, payload=payload))
                continue
            if payload == original:
                continue
            row = self.unit_of_work.session.scalar(
                select(EntityRow)
                .where(EntityRow.id == entity_id, EntityRow.kind == self.kind)
                .with_for_update()
            )
            if row is None or row.payload != original:
                raise RuntimeError(f"Concurrent update detected for {self.kind} {entity_id}.")
            row.payload = payload


class StoreDataView:
    def __init__(self, unit_of_work: "UnitOfWork"):
        for field, (kind, model_type) in ENTITY_FIELDS.items():
            setattr(self, field, EntityCollection(unit_of_work, kind, model_type))
        self.tokens = EntityCollection(unit_of_work, "token", None)


class UnitOfWork:
    def __init__(self, store: "Store"):
        self.store = store
        self.session = store.session_factory()
        self.data = StoreDataView(self)

    def commit(self) -> None:
        for collection in vars(self.data).values():
            collection.flush()
        self.session.commit()

    def rollback(self) -> None:
        self.session.rollback()

    def close(self) -> None:
        self.session.close()


class Store:
    """Database-backed store retaining the old domain-object boundary."""

    def __init__(self, database_url: str | None = None):
        configured_url = database_url or os.getenv("DATABASE_URL", "sqlite:///./evenly.db")
        if configured_url.startswith("postgres://"):
            configured_url = "postgresql+psycopg://" + configured_url.removeprefix("postgres://")
        elif configured_url.startswith("postgresql://"):
            configured_url = "postgresql+psycopg://" + configured_url.removeprefix("postgresql://")
        self.database_url = configured_url
        connect_args = {"check_same_thread": False} if self.database_url.startswith("sqlite") else {}
        self.engine = create_engine(self.database_url, connect_args=connect_args, future=True)
        self.session_factory = sessionmaker(self.engine, expire_on_commit=False)
        if os.getenv("SEED_DEMO_DATA", "false").lower() in {"1", "true", "yes"} and not self.has_entities():
            self.reset()

    @property
    def data(self):
        unit_of_work = _current_unit_of_work.get()
        if unit_of_work is not None:
            return unit_of_work.data
        return self.snapshot()

    def begin_request(self) -> UnitOfWork:
        return UnitOfWork(self)

    def bind(self, unit_of_work: UnitOfWork):
        return _current_unit_of_work.set(unit_of_work)

    def unbind(self, token) -> None:
        _current_unit_of_work.reset(token)

    def check_connection(self) -> None:
        with self.session_factory() as session:
            session.execute(text("SELECT 1"))

    def has_entities(self) -> bool:
        with self.session_factory() as session:
            return session.scalar(select(EntityRow.id).limit(1)) is not None

    def snapshot(self) -> StoreData:
        loaded = StoreData()
        with self.session_factory() as session:
            rows = session.scalars(select(EntityRow)).all()
        for row in rows:
            for field, (kind, model) in ENTITY_FIELDS.items():
                if row.kind == kind:
                    getattr(loaded, field)[row.id] = model.model_validate(row.payload)
                    break
            else:
                if row.kind == "token":
                    loaded.tokens[row.id] = row.payload["user_id"]
        return loaded

    def reset(self) -> None:
        unit_of_work = self.begin_request()
        token = self.bind(unit_of_work)
        try:
            unit_of_work.session.execute(delete(EntityRow))
            self.seed()
            unit_of_work.commit()
        except Exception:
            unit_of_work.rollback()
            raise
        finally:
            unit_of_work.close()
            self.unbind(token)

    def seed(self) -> None:
        from .auth import hash_password

        t = utcnow()
        def ago(days: int) -> datetime: return t - timedelta(days=days)
        ada = StoredUser(id="usr_ada", name="Ada Eze", email="ada@evenly.app", passwordHash=hash_password("password"), createdAt=ago(60), updatedAt=ago(60))
        kunmi = StoredUser(id="usr_kunmi", name="Kunmi Bello", email="kunmi@evenly.app", passwordHash=hash_password("password"), createdAt=ago(58), updatedAt=ago(58))
        for u in (ada, kunmi):
            self.data.users[u.id] = u
        lagos = Group(id="grp_lagos", kind="group", name="Lagos Trip", description="Flights, Airbnb and far too much suya.", ownerId=ada.id, currency="NGN", inviteToken="lagos-invite-demo", createdAt=ago(21), updatedAt=ago(3))
        apartment = Group(id="grp_apartment", kind="group", name="Apartment Expenses", description="Shared bills for the Yaba flat.", ownerId=kunmi.id, currency="NGN", inviteToken=None, createdAt=ago(40), updatedAt=ago(6))
        for g in (lagos, apartment):
            self.data.groups[g.id] = g
        members = [
            GroupMember(id="mbr_lagos_ada", groupId=lagos.id, userId=ada.id, displayName="Ada", role="admin", joinedAt=ago(21)),
            GroupMember(id="mbr_lagos_kunmi", groupId=lagos.id, userId=kunmi.id, displayName="Kunmi", role="member", joinedAt=ago(20)),
            GroupMember(id="mbr_lagos_zainab", groupId=lagos.id, userId=None, displayName="Zainab", role="member", joinedAt=ago(19)),
            GroupMember(id="mbr_apt_kunmi", groupId=apartment.id, userId=kunmi.id, displayName="Kunmi", role="admin", joinedAt=ago(40)),
            GroupMember(id="mbr_apt_ada", groupId=apartment.id, userId=ada.id, displayName="Ada", role="member", joinedAt=ago(40)),
        ]
        for m in members:
            self.data.members[m.id] = m
        self._add_expense("exp_airbnb", lagos.id, "mbr_lagos_ada", "Airbnb in Lekki", 12000000, "shares", [("mbr_lagos_ada", 8000000), ("mbr_lagos_kunmi", 4000000)], [("mbr_lagos_ada", 2), ("mbr_lagos_kunmi", 1), ("mbr_lagos_zainab", 1)], ago(18))
        self._add_expense("exp_dinner", lagos.id, "mbr_lagos_ada", "Dinner at Nok", 4500000, "equal", [("mbr_lagos_ada", 4500000)], [("mbr_lagos_ada", 1), ("mbr_lagos_kunmi", 1), ("mbr_lagos_zainab", 1)], ago(17))
        self._add_expense("exp_electricity", apartment.id, "mbr_apt_kunmi", "Electricity (September)", 3000000, "percentage", [("mbr_apt_kunmi", 3000000)], [("mbr_apt_kunmi", 60), ("mbr_apt_ada", 40)], ago(6))
        self._activity("act_lagos", lagos.id, "mbr_lagos_ada", "Ada", "group_created", "group", lagos.id, "Ada created the group", ago(21))
        self._activity("act_apt", apartment.id, "mbr_apt_kunmi", "Kunmi", "group_created", "group", apartment.id, "Kunmi created the group", ago(40))
        self.data.notifications["ntf_1"] = AppNotification(id="ntf_1", userId=ada.id, groupId=lagos.id, type="expense_created", title="New expense in Lagos Trip", message="Kunmi added an expense", readAt=None, createdAt=ago(3))

    def _activity(self, id, group_id, actor_id, actor_name, action, entity_type, entity_id, summary, created):
        self.data.activities[id] = Activity(id=new_id("act"), groupId=group_id, actorId=actor_id, actorName=actor_name, action=action, entityType=entity_type, entityId=entity_id, summary=summary, createdAt=created)

    def _add_expense(self, id, group_id, actor, description, total, method, payers, participants, created):
        weights = [v for _, v in participants]
        if method == "equal": weights = [1] * len(weights)
        if method == "percentage": weights = [v for _, v in participants]
        amounts = [total * w // sum(weights) for w in weights]
        for i in range(total - sum(amounts)): amounts[i] += 1
        self.data.expenses[id] = Expense(id=id, groupId=group_id, createdBy=actor, description=description, totalAmount=total, currency="NGN", expenseDate=created.date(), splitMethod=method, payers=[ExpensePayer(**{"memberId": m, "amount": a}) for m, a in payers], participants=[ExpenseParticipant(memberId=m, allocationValue=v, calculatedAmount=amounts[i]) for i, (m, v) in enumerate(participants)], receipt=None, createdAt=created, updatedAt=created, deletedAt=None)


store = Store()
