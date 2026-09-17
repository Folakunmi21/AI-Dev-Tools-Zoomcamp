from fastapi import APIRouter, Depends, HTTPException
from ..auth import require_user
from ..models import Expense, ExpenseInput, ExpenseUpdateInput, Receipt
from ..store import store, new_id, utcnow
from .common import access, group_or_404, members, validate_expense, user_member

router = APIRouter(tags=["Expenses"])


@router.post("/expenses", response_model=Expense, status_code=201)
def create(value: ExpenseInput, user=Depends(require_user)):
    group = group_or_404(value.groupId); context = access(group, user.id, write=True)
    expense = validate_expense(group, value); expense.createdBy = context.memberId
    if value.receipt:
        expense.receipt = Receipt(id=new_id("rcp"), expenseId=expense.id, fileName=value.receipt.fileName, fileUrl=value.receipt.fileUrl, createdAt=utcnow())
    store.data.expenses[expense.id] = expense; return expense


@router.get("/expenses/{expense_id}", response_model=Expense)
def get(expense_id: str, user=Depends(require_user)):
    expense = store.data.expenses.get(expense_id)
    if not expense or expense.deletedAt: raise HTTPException(404, "That expense could not be found.")
    access(group_or_404(expense.groupId), user.id); return expense


@router.patch("/expenses/{expense_id}", response_model=Expense)
def update(expense_id: str, value: ExpenseUpdateInput, user=Depends(require_user)):
    old = store.data.expenses.get(expense_id)
    if not old or old.deletedAt: raise HTTPException(404, "That expense could not be found.")
    group = group_or_404(old.groupId); context = access(group, user.id, write=True)
    if old.createdBy != context.memberId: raise HTTPException(403, "Only the person who added an expense can edit it.")
    replacement = validate_expense(group, value); replacement.id = old.id; replacement.groupId = old.groupId; replacement.createdBy = old.createdBy; replacement.createdAt = old.createdAt; replacement.updatedAt = utcnow()
    if value.receipt:
        replacement.receipt = Receipt(id=old.receipt.id if old.receipt else new_id("rcp"), expenseId=old.id, fileName=value.receipt.fileName, fileUrl=value.receipt.fileUrl, createdAt=old.receipt.createdAt if old.receipt else utcnow())
    elif "receipt" not in value.model_fields_set:
        replacement.receipt = old.receipt
    store.data.expenses[old.id] = replacement; return replacement


@router.delete("/expenses/{expense_id}", status_code=204)
def remove(expense_id: str, user=Depends(require_user)):
    expense = store.data.expenses.get(expense_id)
    if not expense or expense.deletedAt: raise HTTPException(404, "That expense could not be found.")
    context = access(group_or_404(expense.groupId), user.id, write=True)
    if expense.createdBy != context.memberId: raise HTTPException(403, "Only the person who added an expense can delete it.")
    expense.deletedAt = utcnow(); expense.updatedAt = expense.deletedAt
