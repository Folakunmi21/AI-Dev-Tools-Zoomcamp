from __future__ import annotations

from collections import defaultdict
from fastapi import HTTPException

from ..models import *
from ..store import store, new_id, utcnow


def group_or_404(group_id: str) -> Group:
    group = store.data.groups.get(group_id)
    if not group: raise HTTPException(404, "That group could not be found.")
    return group


def members(group_id: str) -> list[GroupMember]:
    return [m for m in store.data.members.values() if m.groupId == group_id]


def user_member(group_id: str, user_id: str | None) -> GroupMember | None:
    if user_id is None:
        return None
    return next((m for m in members(group_id) if m.userId == user_id), None)


def access(group: Group, user_id: str | None, write: bool = False) -> ViewerContext:
    member = user_member(group.id, user_id)
    admin = member is not None and member.role == "admin"
    if group.kind == "quick" and (group.ownerId is None or group.ownerId == user_id):
        context = ViewerContext(memberId=member.id if member else (members(group.id)[0].id if members(group.id) else None), isAdmin=True, canEditGroup=True, canManageMembers=True, canManageInvite=False)
    else:
        context = ViewerContext(memberId=member.id if member else None, isAdmin=admin, canEditGroup=admin, canManageMembers=admin, canManageInvite=admin)
    if group.kind == "group" and member is None:
        raise HTTPException(403, "You are not a member of this group.")
    if write and not context.memberId:
        raise HTTPException(403, "You need to be a member of this group to do that.")
    return context


def participant_amounts(total: int, method: str, participants: list[ExpenseParticipantInput]) -> list[int]:
    if not participants: raise HTTPException(422, "At least one participant is required.")
    weights = [1] * len(participants) if method == "equal" else [p.allocationValue for p in participants]
    if any(w < 0 for w in weights) or (method == "shares" and any(w <= 0 for w in weights)):
        raise HTTPException(422, "Allocation values must be valid.")
    if method == "percentage" and round(sum(weights), 2) != 100:
        raise HTTPException(422, "Percentages must add up to 100%.")
    if method == "custom":
        amounts = [round(w) for w in weights]
        if sum(amounts) != total: raise HTTPException(422, "Custom amounts must add up to the expense total.")
        return amounts
    denominator = sum(weights)
    if denominator <= 0: raise HTTPException(422, "Allocation values must be valid.")
    amounts = [int(total * w // denominator) for w in weights]
    for i in range(total - sum(amounts)): amounts[i % len(amounts)] += 1
    return amounts


def validate_expense(group: Group, value: ExpenseInput | ExpenseUpdateInput) -> Expense:
    group_members = {m.id for m in members(group.id)}
    if not value.description.strip(): raise HTTPException(422, "Give the expense a description.")
    if value.totalAmount <= 0: raise HTTPException(422, "Amount must be greater than zero.")
    if not value.payers: raise HTTPException(422, "At least one payer is required.")
    if any(p.memberId not in group_members for p in value.payers + value.participants): raise HTTPException(422, "A payer or participant is not a group member.")
    if sum(p.amount for p in value.payers) != value.totalAmount or any(p.amount <= 0 for p in value.payers): raise HTTPException(422, "Payer contributions must add up to the expense total.")
    if len({p.memberId for p in value.payers}) != len(value.payers) or len({p.memberId for p in value.participants}) != len(value.participants): raise HTTPException(422, "A person can only be listed once.")
    amounts = participant_amounts(value.totalAmount, value.splitMethod, value.participants)
    return Expense(id=new_id("exp"), groupId=group.id, createdBy="", description=value.description.strip(), totalAmount=value.totalAmount, currency=group.currency, expenseDate=value.expenseDate, splitMethod=value.splitMethod, payers=[ExpensePayer(**p.model_dump()) for p in value.payers], participants=[ExpenseParticipant(memberId=p.memberId, allocationValue=p.allocationValue, calculatedAmount=amounts[i]) for i, p in enumerate(value.participants)], receipt=None, createdAt=utcnow(), updatedAt=utcnow(), deletedAt=None)


def balances(group: Group) -> GroupBalances:
    ms = members(group.id); paid = defaultdict(int); share = defaultdict(int); debts: dict[tuple[str, str], list[DebtEdge]] = defaultdict(list)
    for e in store.data.expenses.values():
        if e.groupId != group.id or e.deletedAt: continue
        for p in e.payers: paid[p.memberId] += p.amount
        for p in e.participants: share[p.memberId] += p.calculatedAmount
        net = {m.id: 0 for m in ms}
        for p in e.payers: net[p.memberId] += p.amount
        for p in e.participants: net[p.memberId] -= p.calculatedAmount
        debtors = [[m, -n] for m, n in net.items() if n < 0]; creditors = [[m, n] for m, n in net.items() if n > 0]
        for debtor, amount in debtors:
            for creditor in creditors:
                if amount <= 0: break
                take = min(amount, creditor[1]); creditor[1] -= take; amount -= take
                if take: debts[(debtor, creditor[0])].append(DebtEdge(fromMemberId=debtor, toMemberId=creditor[0], amount=take, expenseId=e.id, expenseDescription=e.description, expenseDate=e.expenseDate))
    settled = defaultdict(int)
    for s in store.data.settlements.values(): settled[(s.fromMemberId, s.toMemberId)] += s.amount
    pairs = []
    for (source, target), edges in debts.items():
        gross = sum(e.amount for e in edges); paid_amount = min(gross, settled[(source, target)])
        pairs.append(PairDebt(fromMemberId=source, toMemberId=target, grossAmount=gross, settledAmount=paid_amount, outstandingAmount=gross-paid_amount, edges=edges))
    return GroupBalances(groupId=group.id, currency=group.currency, members=[MemberBalance(memberId=m.id, displayName=m.displayName, totalPaid=paid[m.id], totalShare=share[m.id], netBalance=paid[m.id]-share[m.id]) for m in ms], debts=pairs)


def summary(group: Group, user_id: str | None) -> GroupSummary:
    expenses = [e for e in store.data.expenses.values() if e.groupId == group.id and not e.deletedAt]
    context = access(group, user_id)
    b = balances(group); member_debt = None
    if context.memberId:
        owes = sum(d.outstandingAmount for d in b.debts if d.fromMemberId == context.memberId); owed = sum(d.outstandingAmount for d in b.debts if d.toMemberId == context.memberId)
        member_debt = MemberDebtSummary(owes=owes, owed=owed, net=owed-owes)
    activity = [a for a in store.data.activities.values() if a.groupId == group.id]
    return GroupSummary(group=group, memberCount=len(members(group.id)), expenseCount=len(expenses), totalSpent=sum(e.totalAmount for e in expenses), viewerDebts=member_debt, lastActivityAt=max([group.createdAt] + [a.createdAt for a in activity]))


def add_activity(group: Group, actor: GroupMember | None, action: str, entity_type: str, entity_id: str | None, summary_text: str):
    store.data.activities[new_id("act")] = Activity(id=new_id("act"), groupId=group.id, actorId=actor.id if actor else None, actorName=actor.displayName if actor else "Someone", action=action, entityType=entity_type, entityId=entity_id, summary=summary_text, createdAt=utcnow())
