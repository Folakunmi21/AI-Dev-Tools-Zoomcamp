from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Id = str
CurrencyCode = Literal["NGN"]
SplitMethod = Literal["equal", "custom", "percentage", "shares"]


class User(BaseModel):
    id: Id
    name: str
    email: str
    createdAt: datetime
    updatedAt: datetime


class Session(BaseModel):
    user: User | None
    access_token: str | None = None
    token_type: str | None = None


class RegisterInput(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=8)


class LoginInput(BaseModel):
    email: str
    password: str


class Group(BaseModel):
    id: Id
    kind: Literal["group", "quick"]
    name: str
    description: str
    ownerId: Id | None
    currency: CurrencyCode = "NGN"
    inviteToken: str | None
    createdAt: datetime
    updatedAt: datetime


class GroupMember(BaseModel):
    id: Id
    groupId: Id
    userId: Id | None
    displayName: str
    role: Literal["admin", "member"]
    joinedAt: datetime


class MemberDebtSummary(BaseModel):
    owes: int
    owed: int
    net: int


class GroupSummary(BaseModel):
    group: Group
    memberCount: int
    expenseCount: int
    totalSpent: int
    viewerDebts: MemberDebtSummary | None
    lastActivityAt: datetime


class CreateGroupInput(BaseModel):
    name: str
    description: str = ""
    currency: CurrencyCode = "NGN"
    memberNames: list[str] = []


class UpdateGroupInput(BaseModel):
    name: str | None = None
    description: str | None = None


class BudgetItem(BaseModel):
    id: Id
    budgetId: Id
    name: str
    amount: int
    isPaid: bool
    createdAt: datetime
    updatedAt: datetime


class PersonalBudget(BaseModel):
    id: Id
    userId: Id
    name: str
    currency: CurrencyCode = "NGN"
    totalAmount: int
    paidAmount: int
    remainingAmount: int
    items: list[BudgetItem]


class CreateBudgetInput(BaseModel):
    name: str
    currency: CurrencyCode = "NGN"


class CreateBudgetItemInput(BaseModel):
    name: str
    amount: int = Field(gt=0)


class UpdateBudgetItemInput(BaseModel):
    name: str | None = None
    amount: int | None = Field(default=None, gt=0)
    isPaid: bool | None = None


class CreateQuickSplitInput(BaseModel):
    name: str | None = None
    memberNames: list[str] = Field(min_length=2)


class AddMemberInput(BaseModel):
    displayName: str


class InviteToken(BaseModel):
    token: str


class InvitePreview(BaseModel):
    groupId: Id
    groupName: str
    memberCount: int
    valid: bool


class AcceptInviteInput(BaseModel):
    displayName: str | None = None


class InviteUserInput(BaseModel):
    email: str


class ExpensePayerInput(BaseModel):
    memberId: Id
    amount: int


class ExpenseParticipantInput(BaseModel):
    memberId: Id
    allocationValue: float = 1


class UploadedFile(BaseModel):
    fileName: str
    fileUrl: str


class ExpenseInput(BaseModel):
    groupId: Id
    description: str
    totalAmount: int
    expenseDate: date
    splitMethod: SplitMethod
    payers: list[ExpensePayerInput]
    participants: list[ExpenseParticipantInput]
    receipt: UploadedFile | None = None


class ExpenseUpdateInput(BaseModel):
    description: str
    totalAmount: int
    expenseDate: date
    splitMethod: SplitMethod
    payers: list[ExpensePayerInput]
    participants: list[ExpenseParticipantInput]
    receipt: UploadedFile | None = None


class ExpensePayer(ExpensePayerInput):
    pass


class ExpenseParticipant(BaseModel):
    memberId: Id
    allocationValue: float
    calculatedAmount: int


class Receipt(BaseModel):
    id: Id
    expenseId: Id
    fileName: str
    fileUrl: str
    createdAt: datetime


class Expense(BaseModel):
    id: Id
    groupId: Id
    createdBy: Id
    description: str
    totalAmount: int
    currency: CurrencyCode
    expenseDate: date
    splitMethod: SplitMethod
    payers: list[ExpensePayer]
    participants: list[ExpenseParticipant]
    receipt: Receipt | None
    createdAt: datetime
    updatedAt: datetime
    deletedAt: datetime | None


class DebtEdge(BaseModel):
    fromMemberId: Id
    toMemberId: Id
    amount: int
    expenseId: Id
    expenseDescription: str
    expenseDate: date


class PairDebt(BaseModel):
    fromMemberId: Id
    toMemberId: Id
    grossAmount: int
    settledAmount: int
    outstandingAmount: int
    edges: list[DebtEdge]


class MemberBalance(BaseModel):
    memberId: Id
    displayName: str
    totalPaid: int
    totalShare: int
    netBalance: int


class GroupBalances(BaseModel):
    groupId: Id
    currency: CurrencyCode
    members: list[MemberBalance]
    debts: list[PairDebt]


class Settlement(BaseModel):
    id: Id
    groupId: Id
    fromMemberId: Id
    toMemberId: Id
    amount: int
    status: Literal["paid"]
    paidAt: datetime
    markedPaidBy: Id
    createdAt: datetime


class Activity(BaseModel):
    id: Id
    groupId: Id
    actorId: Id | None
    actorName: str
    action: str
    entityType: Literal["expense", "member", "group", "settlement", "invite"]
    entityId: Id | None
    summary: str
    createdAt: datetime


class AppNotification(BaseModel):
    id: Id
    userId: Id
    groupId: Id | None
    type: Literal["expense_created", "expense_edited", "expense_deleted", "debt_marked_paid", "group_invitation"]
    title: str
    message: str
    readAt: datetime | None
    createdAt: datetime


class ViewerContext(BaseModel):
    memberId: Id | None
    isAdmin: bool
    canEditGroup: bool
    canManageMembers: bool
    canManageInvite: bool


class GroupDetail(BaseModel):
    group: Group
    members: list[GroupMember]
    expenses: list[Expense]
    balances: GroupBalances
    settlements: list[Settlement]
    activities: list[Activity]
    viewer: ViewerContext


class DashboardData(BaseModel):
    user: User | None
    groups: list[GroupSummary]
    quickSplits: list[GroupSummary]
    totals: MemberDebtSummary
    recentActivity: list[Activity]
    unreadNotifications: int


class MarkPaidInput(BaseModel):
    groupId: Id
    fromMemberId: Id
    toMemberId: Id
    amount: int


class UnreadCount(BaseModel):
    count: int


class ValidationIssue(BaseModel):
    field: str
    message: str


class ApiError(BaseModel):
    code: str
    message: str
    issues: list[ValidationIssue] = []


class StoredUser(User):
    passwordHash: str


class StoreData(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    users: dict[str, StoredUser] = {}
    groups: dict[str, Group] = {}
    members: dict[str, GroupMember] = {}
    expenses: dict[str, Expense] = {}
    settlements: dict[str, Settlement] = {}
    activities: dict[str, Activity] = {}
    notifications: dict[str, AppNotification] = {}
    budgets: dict[str, PersonalBudget] = {}
    tokens: dict[str, str] = {}
