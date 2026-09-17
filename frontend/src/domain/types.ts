import type { CurrencyCode, Kobo } from './money'

export type Id = string
export type IsoDate = string

export type SplitMethod = 'equal' | 'custom' | 'percentage' | 'shares'

export type MemberRole = 'admin' | 'member'

export interface User {
  id: Id
  name: string
  email: string
  createdAt: IsoDate
  updatedAt: IsoDate
}

/**
 * A group and a quick split share the same shape. A quick split is a group with
 * `kind: 'quick'` that is not listed under "My Groups" and (while the user is a
 * guest) lives only in this browser.
 */
export interface Group {
  id: Id
  kind: 'group' | 'quick'
  name: string
  description: string
  ownerId: Id | null
  currency: CurrencyCode
  inviteToken: string | null
  createdAt: IsoDate
  updatedAt: IsoDate
}

/**
 * Members are the unit that owes and is owed. `userId` is null for people who
 * were added by name and have no account, which is what makes Quick Split and
 * manual addition work without sign-up.
 */
export interface GroupMember {
  id: Id
  groupId: Id
  userId: Id | null
  displayName: string
  role: MemberRole
  joinedAt: IsoDate
}

export interface ExpensePayer {
  memberId: Id
  amount: Kobo
}

export interface ExpenseParticipant {
  memberId: Id
  /** Raw value the user typed for this participant: kobo, percent, or share count. */
  allocationValue: number
  /** Resolved amount this participant is responsible for. Always reconciles to the total. */
  calculatedAmount: Kobo
}

export interface Receipt {
  id: Id
  expenseId: Id
  fileName: string
  /** Data URL in the mock backend; an object-storage URL behind a real one. */
  fileUrl: string
  createdAt: IsoDate
}

export interface Expense {
  id: Id
  groupId: Id
  createdBy: Id
  description: string
  totalAmount: Kobo
  currency: CurrencyCode
  expenseDate: IsoDate
  splitMethod: SplitMethod
  payers: ExpensePayer[]
  participants: ExpenseParticipant[]
  receipt: Receipt | null
  createdAt: IsoDate
  updatedAt: IsoDate
  deletedAt: IsoDate | null
}

export type SettlementStatus = 'paid'

/**
 * A settlement records that a debt between two members was marked paid. It never
 * mutates the expense it came from: the expense is the record of what happened,
 * the settlement is the record of what has since been squared up.
 */
export interface Settlement {
  id: Id
  groupId: Id
  fromMemberId: Id
  toMemberId: Id
  amount: Kobo
  status: SettlementStatus
  paidAt: IsoDate
  markedPaidBy: Id
  createdAt: IsoDate
}

export type ActivityAction =
  | 'expense_created'
  | 'expense_edited'
  | 'expense_deleted'
  | 'member_joined'
  | 'member_added'
  | 'member_removed'
  | 'group_created'
  | 'group_updated'
  | 'debt_marked_paid'
  | 'invite_link_created'
  | 'invite_link_revoked'

export interface Activity {
  id: Id
  groupId: Id
  /** Member id of the actor, or null for system actions. */
  actorId: Id | null
  actorName: string
  action: ActivityAction
  entityType: 'expense' | 'member' | 'group' | 'settlement' | 'invite'
  entityId: Id | null
  /** Human-readable summary, pre-rendered so the audit trail survives deletions. */
  summary: string
  createdAt: IsoDate
}

export type NotificationType =
  | 'expense_created'
  | 'expense_edited'
  | 'expense_deleted'
  | 'debt_marked_paid'
  | 'group_invitation'

export interface AppNotification {
  id: Id
  userId: Id
  groupId: Id | null
  type: NotificationType
  title: string
  message: string
  readAt: IsoDate | null
  createdAt: IsoDate
}

/** A single obligation produced by one expense: `from` owes `to` this amount. */
export interface DebtEdge {
  fromMemberId: Id
  toMemberId: Id
  amount: Kobo
  expenseId: Id
  expenseDescription: string
  expenseDate: IsoDate
}

/**
 * Obligations between one pair of members, in one direction.
 *
 * `edges` are kept rather than collapsed: the spec requires that transaction-level
 * debt relationships remain visible and that chains are never simplified.
 */
export interface PairDebt {
  fromMemberId: Id
  toMemberId: Id
  grossAmount: Kobo
  settledAmount: Kobo
  outstandingAmount: Kobo
  edges: DebtEdge[]
}

export interface MemberBalance {
  memberId: Id
  displayName: string
  totalPaid: Kobo
  totalShare: Kobo
  /** totalPaid - totalShare. Positive: owed money. Negative: owes money. */
  netBalance: Kobo
}

export interface GroupBalances {
  groupId: Id
  currency: CurrencyCode
  members: MemberBalance[]
  debts: PairDebt[]
}
