from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import require_user
from ..models import BudgetItem, CreateBudgetInput, CreateBudgetItemInput, PersonalBudget, UpdateBudgetItemInput
from ..store import new_id, store, utcnow

router = APIRouter(prefix="/budgets", tags=["Personal budgets"])


def owned_budget(budget_id: str, user) -> PersonalBudget:
    budget = store.data.budgets.get(budget_id)
    if not budget or budget.userId != user.id:
        raise HTTPException(404, "That personal budget could not be found.")
    return budget


def with_totals(budget: PersonalBudget) -> PersonalBudget:
    budget.totalAmount = sum(item.amount for item in budget.items)
    budget.paidAmount = sum(item.amount for item in budget.items if item.isPaid)
    budget.remainingAmount = budget.totalAmount - budget.paidAmount
    return budget


@router.get("", response_model=list[PersonalBudget])
def list_budgets(user=Depends(require_user)):
    return [with_totals(b) for b in store.data.budgets.values(payload_filters={"userId": user.id})]


@router.post("", response_model=PersonalBudget, status_code=status.HTTP_201_CREATED)
def create_budget(value: CreateBudgetInput, user=Depends(require_user)):
    if not value.name.strip():
        raise HTTPException(422, "Give the budget a name.")
    budget = PersonalBudget(id=new_id("bud"), userId=user.id, name=value.name.strip(), currency=value.currency, totalAmount=0, paidAmount=0, remainingAmount=0, items=[])
    store.data.budgets[budget.id] = budget
    return budget


@router.get("/{budget_id}", response_model=PersonalBudget)
def get_budget(budget_id: str, user=Depends(require_user)):
    return with_totals(owned_budget(budget_id, user))


@router.post("/{budget_id}/items", response_model=PersonalBudget, status_code=status.HTTP_201_CREATED)
def add_item(budget_id: str, value: CreateBudgetItemInput, user=Depends(require_user)):
    budget = owned_budget(budget_id, user)
    if not value.name.strip():
        raise HTTPException(422, "Give the expense a name.")
    now = utcnow()
    budget.items.append(BudgetItem(id=new_id("bit"), budgetId=budget.id, name=value.name.strip(), amount=value.amount, isPaid=False, createdAt=now, updatedAt=now))
    return with_totals(budget)


@router.patch("/{budget_id}/items/{item_id}", response_model=PersonalBudget)
def update_item(budget_id: str, item_id: str, value: UpdateBudgetItemInput, user=Depends(require_user)):
    budget = owned_budget(budget_id, user)
    item = next((item for item in budget.items if item.id == item_id), None)
    if not item:
        raise HTTPException(404, "That budget expense could not be found.")
    if value.name is not None:
        if not value.name.strip():
            raise HTTPException(422, "Give the expense a name.")
        item.name = value.name.strip()
    if value.amount is not None:
        item.amount = value.amount
    if value.isPaid is not None:
        item.isPaid = value.isPaid
    item.updatedAt = utcnow()
    return with_totals(budget)


@router.delete("/{budget_id}/items/{item_id}", response_model=PersonalBudget)
def delete_item(budget_id: str, item_id: str, user=Depends(require_user)):
    budget = owned_budget(budget_id, user)
    original = len(budget.items)
    budget.items = [item for item in budget.items if item.id != item_id]
    if len(budget.items) == original:
        raise HTTPException(404, "That budget expense could not be found.")
    return with_totals(budget)
