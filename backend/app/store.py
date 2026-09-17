"""The process-local data store and deterministic seed data."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from .models import *


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:10]}"


class Store:
    def __init__(self) -> None:
        self.data = StoreData()
        self.seed()

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
        self.data.activities[id] = Activity(id=id, groupId=group_id, actorId=actor_id, actorName=actor_name, action=action, entityType=entity_type, entityId=entity_id, summary=summary, createdAt=created)

    def _add_expense(self, id, group_id, actor, description, total, method, payers, participants, created):
        weights = [v for _, v in participants]
        if method == "equal": weights = [1] * len(weights)
        if method == "percentage": weights = [v for _, v in participants]
        amounts = [total * w // sum(weights) for w in weights]
        for i in range(total - sum(amounts)): amounts[i] += 1
        self.data.expenses[id] = Expense(id=id, groupId=group_id, createdBy=actor, description=description, totalAmount=total, currency="NGN", expenseDate=created.date(), splitMethod=method, payers=[ExpensePayer(**{"memberId": m, "amount": a}) for m, a in payers], participants=[ExpenseParticipant(memberId=m, allocationValue=v, calculatedAmount=amounts[i]) for i, (m, v) in enumerate(participants)], receipt=None, createdAt=created, updatedAt=created, deletedAt=None)


store = Store()
