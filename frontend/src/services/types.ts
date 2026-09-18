import type { MemberDebtSummary } from '../domain/balances'
import type { CurrencyCode, Kobo } from '../domain/money'
import type { ValidationIssue } from '../domain/split'
import type {
  Activity,
  AppNotification,
  Expense,
  Group,
  GroupBalances,
  GroupMember,
  Id,
  IsoDate,
  Settlement,
  SplitMethod,
  User,
} from '../domain/types'

/**
 * The single seam between Evenly's UI and its backend.
 *
 * Every call that would hit a server lives on this interface. No component, page
 * or hook may import `fetch`, a database client, or `localStorage` directly: they
 * take an `EvenlyService` from `useService()`. That is what lets the entire app
 * run against `createMockService()` with no backend at all, and lets a real
 * backend be dropped in by implementing this one interface.
 */
export interface EvenlyService {
  auth: AuthService
  dashboard: DashboardService
  groups: GroupService
  expenses: ExpenseService
  settlements: SettlementService
  notifications: NotificationService
  uploads: UploadService
  budgets: BudgetService
}

/* -------------------------------------------------------------------------- */
/* Personal budgets                                                           */
/* -------------------------------------------------------------------------- */

export interface BudgetItem {
  id: Id
  budgetId: Id
  name: string
  amount: Kobo
  isPaid: boolean
  createdAt: IsoDate
  updatedAt: IsoDate
}

export interface PersonalBudget {
  id: Id
  userId: Id
  name: string
  currency: CurrencyCode
  totalAmount: Kobo
  paidAmount: Kobo
  remainingAmount: Kobo
  items: BudgetItem[]
}

export interface BudgetService {
  list(): Promise<PersonalBudget[]>
  get(budgetId: Id): Promise<PersonalBudget>
  create(input: { name: string; currency?: CurrencyCode }): Promise<PersonalBudget>
  addItem(budgetId: Id, input: { name: string; amount: Kobo }): Promise<PersonalBudget>
  updateItem(
    budgetId: Id,
    itemId: Id,
    input: { name?: string; amount?: Kobo; isPaid?: boolean },
  ): Promise<PersonalBudget>
  removeItem(budgetId: Id, itemId: Id): Promise<PersonalBudget>
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export type ServiceErrorCode =
  | 'validation'
  | 'not_found'
  | 'forbidden'
  | 'unauthenticated'
  | 'conflict'

/** The one error shape the UI has to understand, whatever the implementation. */
export class ServiceError extends Error {
  readonly code: ServiceErrorCode
  readonly issues: ValidationIssue[]

  constructor(code: ServiceErrorCode, message: string, issues: ValidationIssue[] = []) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
    this.issues = issues
  }
}

export const isServiceError = (error: unknown): error is ServiceError =>
  error instanceof ServiceError

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

export interface Session {
  /** null means the visitor is a guest. Guests can still use Quick Split. */
  user: User | null
}

export interface RegisterInput {
  name: string
  email: string
  password: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface AuthService {
  getSession(): Promise<Session>
  register(input: RegisterInput): Promise<Session>
  login(input: LoginInput): Promise<Session>
  logout(): Promise<void>
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

export interface GroupSummary {
  group: Group
  memberCount: number
  expenseCount: number
  totalSpent: Kobo
  /** The viewer's outstanding position in this group; null if they are not a member. */
  viewerDebts: MemberDebtSummary | null
  lastActivityAt: IsoDate
}

export interface DashboardData {
  user: User | null
  groups: GroupSummary[]
  /** Quick splits are kept out of "My Groups" but still reachable from the dashboard. */
  quickSplits: GroupSummary[]
  totals: MemberDebtSummary
  recentActivity: Activity[]
  unreadNotifications: number
}

export interface DashboardService {
  get(): Promise<DashboardData>
}

/* -------------------------------------------------------------------------- */
/* Groups, membership and quick splits                                        */
/* -------------------------------------------------------------------------- */

/** What the current viewer is allowed to do in a group (spec section 16). */
export interface ViewerContext {
  memberId: Id | null
  isAdmin: boolean
  canEditGroup: boolean
  canManageMembers: boolean
  canManageInvite: boolean
}

export interface GroupDetail {
  group: Group
  members: GroupMember[]
  /** Newest first, deleted expenses excluded. */
  expenses: Expense[]
  balances: GroupBalances
  settlements: Settlement[]
  /** Newest first, includes entries for deleted expenses. */
  activities: Activity[]
  viewer: ViewerContext
}

export interface CreateGroupInput {
  name: string
  description?: string
  currency?: CurrencyCode
  /** Extra members to add by name alongside the creator. */
  memberNames?: string[]
}

export interface UpdateGroupInput {
  name?: string
  description?: string
}

export interface CreateQuickSplitInput {
  /** Defaults to a dated name such as "Quick Split - 17 Sep". */
  name?: string
  /** People in the split, by name. The first is treated as the viewer. */
  memberNames: string[]
}

export interface InvitePreview {
  groupId: Id
  groupName: string
  memberCount: number
  /** The invite is still valid and can be accepted. */
  valid: boolean
}

export interface GroupService {
  list(): Promise<GroupSummary[]>
  create(input: CreateGroupInput): Promise<Group>
  get(groupId: Id): Promise<GroupDetail>
  update(groupId: Id, input: UpdateGroupInput): Promise<Group>

  createQuickSplit(input: CreateQuickSplitInput): Promise<Group>
  /** Attach a guest's quick split to the signed-in account so it syncs. */
  saveQuickSplit(groupId: Id): Promise<Group>

  addMember(groupId: Id, displayName: string): Promise<GroupMember>
  removeMember(groupId: Id, memberId: Id): Promise<void>

  createInviteLink(groupId: Id): Promise<{ token: string }>
  revokeInviteLink(groupId: Id): Promise<void>
  previewInvite(token: string): Promise<InvitePreview>
  /** Join via invite link. `displayName` is used when the invitee has no account. */
  acceptInvite(token: string, displayName?: string): Promise<GroupMember>
  /** Invite an existing member's linked account to a group (in-app notification only). */
  inviteUserByEmail(groupId: Id, email: string): Promise<void>
}

/* -------------------------------------------------------------------------- */
/* Expenses                                                                   */
/* -------------------------------------------------------------------------- */

export interface ExpensePayerInput {
  memberId: Id
  amount: Kobo
}

export interface ExpenseParticipantInput {
  memberId: Id
  /** kobo for `custom`, percent for `percentage`, shares for `shares`, ignored for `equal`. */
  allocationValue?: number
}

export interface ExpenseInput {
  groupId: Id
  description: string
  totalAmount: Kobo
  expenseDate: IsoDate
  splitMethod: SplitMethod
  payers: ExpensePayerInput[]
  participants: ExpenseParticipantInput[]
  /** Result of `uploads.uploadReceipt`, or null for no receipt. */
  receipt?: UploadedFile | null
}

export interface ExpenseService {
  create(input: ExpenseInput): Promise<Expense>
  update(expenseId: Id, input: Omit<ExpenseInput, 'groupId'>): Promise<Expense>
  /** Soft delete: the expense leaves the ledger but stays in the activity history. */
  remove(expenseId: Id): Promise<void>
  get(expenseId: Id): Promise<Expense>
}

/* -------------------------------------------------------------------------- */
/* Settlements                                                                */
/* -------------------------------------------------------------------------- */

export interface MarkPaidInput {
  groupId: Id
  fromMemberId: Id
  toMemberId: Id
  amount: Kobo
}

export interface SettlementService {
  markDebtPaid(input: MarkPaidInput): Promise<Settlement>
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

export interface NotificationService {
  list(): Promise<AppNotification[]>
  unreadCount(): Promise<number>
  markRead(notificationId: Id): Promise<void>
  markAllRead(): Promise<void>
}

/* -------------------------------------------------------------------------- */
/* Uploads                                                                    */
/* -------------------------------------------------------------------------- */

export interface UploadedFile {
  fileName: string
  fileUrl: string
}

export interface UploadService {
  /** Store a receipt image and return a URL the group's members can read. */
  uploadReceipt(file: File): Promise<UploadedFile>
}
