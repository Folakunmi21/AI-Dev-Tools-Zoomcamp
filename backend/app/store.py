"""SQLAlchemy-backed persistence for the Evenly domain.

The routers continue to work with the existing Pydantic domain objects, while
this module handles serialization and database access in one place. The
database URL is configured with ``DATABASE_URL`` and defaults to SQLite.
"""
from __future__ import annotations

import os
from datetime import timedelta, datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, String, create_engine, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from .models import *


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:10]}"


class Base(DeclarativeBase):
    pass


class EntityRow(Base):
    __tablename__ = "evenly_entities"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    kind: Mapped[str] = mapped_column(String(40), index=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)


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
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(self.engine, expire_on_commit=False)
        self.data = StoreData()
        self.load()
        if os.getenv("SEED_DEMO_DATA", "false").lower() in {"1", "true", "yes"} and not self.has_entities():
            self.seed()
            self.persist()

    def check_connection(self) -> None:
        with self.session_factory() as session:
            session.execute(text("SELECT 1"))

    def has_entities(self) -> bool:
        with self.session_factory() as session:
            return session.scalar(select(EntityRow.id).limit(1)) is not None

    def load(self) -> None:
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
        self.data = loaded

    def persist(self) -> None:
        with self.session_factory() as session:
            session.query(EntityRow).delete()
            rows: list[EntityRow] = []
            for field, (kind, _) in ENTITY_FIELDS.items():
                for entity_id, entity in getattr(self.data, field).items():
                    rows.append(EntityRow(id=entity_id, kind=kind, payload=entity.model_dump(mode="json")))
            rows.extend(EntityRow(id=token, kind="token", payload={"user_id": user_id}) for token, user_id in self.data.tokens.items())
            session.add_all(rows)
            session.commit()

    def reset(self) -> None:
        with self.session_factory() as session:
            session.query(EntityRow).delete()
            session.commit()
        self.data = StoreData()
        self.seed()
        self.persist()

    def seed(self) -> None:
        from .auth import hash_password

        t = utcnow()
        def ago(days: int) -> datetime: return t - timedelta(days=days)
        ada = StoredUser(id="usr_ada", name="Ada Eze", email="ada@evenly.app", passwordHash=hash_password("password"), createdAt=ago(60), updatedAt=ago(60))
        kunmi = StoredUser(id="usr_kunmi", name="Kunmi Bello", email="kunmi@evenly.app", passwordHash=hash_password("password"), createdAt=ago(58), updatedAt=ago(58))
        self.data.users = {u.id: u for u in (ada, kunmi)}
        lagos = Group(id="grp_lagos", kind="group", name="Lagos Trip", description="Flights, Airbnb and far too much suya.", ownerId=ada.id, currency="NGN", inviteToken="lagos-invite-demo", createdAt=ago(21), updatedAt=ago(3))
        apartment = Group(id="grp_apartment", kind="group", name="Apartment Expenses", description="Shared bills for the Yaba flat.", ownerId=kunmi.id, currency="NGN", inviteToken=None, createdAt=ago(40), updatedAt=ago(6))
        self.data.groups = {g.id: g for g in (lagos, apartment)}
        members = [
            GroupMember(id="mbr_lagos_ada", groupId=lagos.id, userId=ada.id, displayName="Ada", role="admin", joinedAt=ago(21)),
            GroupMember(id="mbr_lagos_kunmi", groupId=lagos.id, userId=kunmi.id, displayName="Kunmi", role="member", joinedAt=ago(20)),
            GroupMember(id="mbr_lagos_zainab", groupId=lagos.id, userId=None, displayName="Zainab", role="member", joinedAt=ago(19)),
            GroupMember(id="mbr_apt_kunmi", groupId=apartment.id, userId=kunmi.id, displayName="Kunmi", role="admin", joinedAt=ago(40)),
            GroupMember(id="mbr_apt_ada", groupId=apartment.id, userId=ada.id, displayName="Ada", role="member", joinedAt=ago(40)),
        ]
        self.data.members = {m.id: m for m in members}
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
