from fastapi import APIRouter, Depends, HTTPException
from ..auth import require_user
from ..models import MarkPaidInput, Settlement
from ..store import store, new_id, utcnow
from .common import access, balances, group_or_404

router = APIRouter(tags=["Settlements"])

@router.post("/settlements", response_model=Settlement, status_code=201)
def mark_paid(value: MarkPaidInput, user=Depends(require_user)):
    group = group_or_404(value.groupId); context = access(group, user.id, write=True)
    if value.fromMemberId == value.toMemberId or value.amount <= 0: raise HTTPException(422, "Pick two different people and a positive amount.")
    if context.memberId not in (value.fromMemberId, value.toMemberId) and not context.isAdmin: raise HTTPException(403, "Only someone involved in a debt, or a group admin, can mark it paid.")
    debt = next((d for d in balances(group).debts if d.fromMemberId == value.fromMemberId and d.toMemberId == value.toMemberId), None)
    if not debt: raise HTTPException(404, "That debt could not be found.")
    if value.amount > debt.outstandingAmount: raise HTTPException(422, "Amount exceeds the outstanding debt.")
    t = utcnow(); settlement = Settlement(id=new_id("stl"), groupId=group.id, fromMemberId=value.fromMemberId, toMemberId=value.toMemberId, amount=value.amount, status="paid", paidAt=t, markedPaidBy=context.memberId, createdAt=t); store.data.settlements[settlement.id] = settlement; return settlement
