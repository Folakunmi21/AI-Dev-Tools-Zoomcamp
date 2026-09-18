import { computeGroupBalances, summarizeMemberDebts } from '../../domain/balances'
import { DEFAULT_CURRENCY, formatMoney, sum } from '../../domain/money'
import { computeParticipantAmounts, validateSplit, type ValidationIssue } from '../../domain/split'
import type {
  Activity,
  ActivityAction,
  AppNotification,
  Expense,
  Group,
  GroupMember,
  Id,
  NotificationType,
  Settlement,
  User,
} from '../../domain/types'
import {
  defaultStorage,
  emptyDb,
  newId,
  newToken,
  parseDb,
  serializeDb,
  snapshot,
  type MockDb,
  type MockStorage,
  type StoredUser,
} from './db'
import { seedDb } from './seed'
import {
  ServiceError,
  type CreateGroupInput,
  type CreateQuickSplitInput,
  type DashboardData,
  type EvenlyService,
  type ExpenseInput,
  type GroupDetail,
  type GroupSummary,
  type InvitePreview,
  type LoginInput,
  type MarkPaidInput,
  type PersonalBudget,
  type RegisterInput,
  type Session,
  type UploadedFile,
  type ViewerContext,
} from '../types'

export interface MockServiceOptions {
  /** Where the database is persisted. Defaults to localStorage when available. */
  storage?: MockStorage
  /** Artificial latency so the UI exercises its loading states. 0 in tests. */
  latencyMs?: number
  /** Start from demo data (default) or an empty database. */
  seed?: boolean
}

const wait = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : null)

const nowIso = () => new Date().toISOString()

const todayIso = () => nowIso().slice(0, 10)

const validationError = (issues: ValidationIssue[]) =>
  new ServiceError('validation', issues[0]?.message ?? 'That does not look right.', issues)

const notFound = (what: string) => new ServiceError('not_found', `${what} could not be found.`)

const forbidden = (message: string) => new ServiceError('forbidden', message)

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name

/**
 * An in-memory implementation of {@link EvenlyService}.
 *
 * It exists so the whole product runs, and can be tested, with no server: it
 * holds the same entities a real backend would, enforces the same permissions,
 * writes the same activity entries and notifications, and persists to
 * localStorage so a reload does not lose the group you just made.
 */
export function createMockService(options: MockServiceOptions = {}): EvenlyService {
  const storage = options.storage ?? defaultStorage()
  const latencyMs = options.latencyMs ?? 0
  const shouldSeed = options.seed ?? true

  const persisted = parseDb(storage.read())
  const db: MockDb = persisted ?? (shouldSeed ? seedDb() : emptyDb())
  if (!persisted) persist()

  function persist() {
    storage.write(serializeDb(db))
  }

  /** Every service method funnels through here: simulate latency, then commit. */
  async function transaction<T>(run: () => T): Promise<T> {
    await wait(latencyMs)
    const result = run()
    persist()
    return snapshot(result)
  }

  async function query<T>(run: () => T): Promise<T> {
    await wait(latencyMs)
    return snapshot(run())
  }

  /* ---------------------------------------------------------------------- */
  /* Internal helpers                                                       */
  /* ---------------------------------------------------------------------- */

  const currentUser = (): StoredUser | null =>
    db.users.find((user) => user.id === db.sessionUserId) ?? null

  const publicUser = (user: StoredUser): User => {
    const { password: _password, ...rest } = user
    return rest
  }

  const requireUser = (): StoredUser => {
    const user = currentUser()
    if (!user) throw new ServiceError('unauthenticated', 'Sign in to continue.')
    return user
  }

  const getGroup = (groupId: Id): Group => {
    const group = db.groups.find((candidate) => candidate.id === groupId)
    if (!group) throw notFound('That group')
    return group
  }

  const membersOf = (groupId: Id): GroupMember[] =>
    db.members.filter((member) => member.groupId === groupId)

  const liveExpensesOf = (groupId: Id): Expense[] =>
    db.expenses.filter((expense) => expense.groupId === groupId && !expense.deletedAt)

  const settlementsOf = (groupId: Id): Settlement[] =>
    db.settlements.filter((settlement) => settlement.groupId === groupId)

  const budgetTotals = (budget: PersonalBudget): PersonalBudget => ({
    ...budget,
    totalAmount: sum(budget.items.map((item) => item.amount)),
    paidAmount: sum(budget.items.filter((item) => item.isPaid).map((item) => item.amount)),
    remainingAmount: sum(budget.items.filter((item) => !item.isPaid).map((item) => item.amount)),
  })

  /**
   * A guest owns the quick splits in their own browser; once signed in, a user
   * owns the quick splits they saved. Either way the quick split has a single
   * driver, and its first member represents them.
   */
  const ownsQuickSplit = (group: Group): boolean =>
    group.kind === 'quick' && (group.ownerId === null || group.ownerId === db.sessionUserId)

  function viewerContext(group: Group): ViewerContext {
    const members = membersOf(group.id)
    const user = currentUser()
    const linked = user ? members.find((member) => member.userId === user.id) : undefined

    if (group.kind === 'quick' && ownsQuickSplit(group)) {
      return {
        memberId: linked?.id ?? members[0]?.id ?? null,
        isAdmin: true,
        canEditGroup: true,
        canManageMembers: true,
        canManageInvite: false,
      }
    }

    const isAdmin = linked?.role === 'admin'
    return {
      memberId: linked?.id ?? null,
      isAdmin,
      canEditGroup: isAdmin,
      canManageMembers: isAdmin,
      canManageInvite: isAdmin,
    }
  }

  /** Read access: members of a saved group, or the owner of a quick split. */
  function requireAccess(group: Group): ViewerContext {
    const viewer = viewerContext(group)
    if (group.kind === 'quick') {
      if (!ownsQuickSplit(group)) throw notFound('That quick split')
      return viewer
    }
    if (!viewer.memberId) throw forbidden('You are not a member of this group.')
    return viewer
  }

  function requireActingMember(group: Group): GroupMember {
    const viewer = requireAccess(group)
    if (!viewer.memberId) throw forbidden('You need to be a member of this group to do that.')
    const member = db.members.find((candidate) => candidate.id === viewer.memberId)
    if (!member) throw forbidden('You need to be a member of this group to do that.')
    return member
  }

  function recordActivity(
    group: Group,
    actor: GroupMember | null,
    action: ActivityAction,
    entityType: Activity['entityType'],
    entityId: Id | null,
    summary: string,
  ): Activity {
    const entry: Activity = {
      id: newId('act'),
      groupId: group.id,
      actorId: actor?.id ?? null,
      actorName: actor?.displayName ?? 'Someone',
      action,
      entityType,
      entityId,
      summary,
      createdAt: nowIso(),
    }
    db.activities.push(entry)
    group.updatedAt = entry.createdAt
    return entry
  }

  /** Notify every member with an account except the person who acted. */
  function notifyGroup(
    group: Group,
    actor: GroupMember | null,
    type: NotificationType,
    title: string,
    message: string,
  ) {
    for (const member of membersOf(group.id)) {
      if (!member.userId) continue
      if (actor && member.id === actor.id) continue
      db.notifications.push({
        id: newId('ntf'),
        userId: member.userId,
        groupId: group.id,
        type,
        title,
        message,
        readAt: null,
        createdAt: nowIso(),
      })
    }
  }

  function balancesFor(group: Group) {
    return computeGroupBalances(group, membersOf(group.id), liveExpensesOf(group.id), settlementsOf(group.id))
  }

  function summarize(group: Group): GroupSummary {
    const members = membersOf(group.id)
    const expenses = liveExpensesOf(group.id)
    const viewer = viewerContext(group)
    const activities = db.activities.filter((activity) => activity.groupId === group.id)
    const lastActivityAt = activities.reduce(
      (latest, activity) => (activity.createdAt > latest ? activity.createdAt : latest),
      group.createdAt,
    )
    return {
      group,
      memberCount: members.length,
      expenseCount: expenses.length,
      totalSpent: sum(expenses.map((expense) => expense.totalAmount)),
      viewerDebts: viewer.memberId ? summarizeMemberDebts(balancesFor(group), viewer.memberId) : null,
      lastActivityAt,
    }
  }

  const accessibleGroups = (): Group[] => {
    const user = currentUser()
    return db.groups.filter((group) => {
      if (group.kind === 'quick') return ownsQuickSplit(group)
      if (!user) return false
      return membersOf(group.id).some((member) => member.userId === user.id)
    })
  }

  /** Shared by create and update: validate, then resolve the split. */
  function resolveExpenseParts(input: Omit<ExpenseInput, 'groupId'>, members: GroupMember[]) {
    const issues: ValidationIssue[] = []
    if (!input.description.trim()) {
      issues.push({ field: 'description', message: 'Give the expense a description.' })
    }
    if (!input.expenseDate) {
      issues.push({ field: 'expenseDate', message: 'Pick a date for the expense.' })
    }

    const memberIds = new Set(members.map((member) => member.id))
    const unknownPayer = input.payers.some((payer) => !memberIds.has(payer.memberId))
    const unknownParticipant = input.participants.some(
      (participant) => !memberIds.has(participant.memberId),
    )
    if (unknownPayer) {
      issues.push({ field: 'payers', message: 'A payer is not a member of this group.' })
    }
    if (unknownParticipant) {
      issues.push({ field: 'participants', message: 'A participant is not a member of this group.' })
    }

    const splitInput = {
      totalAmount: input.totalAmount,
      splitMethod: input.splitMethod,
      payers: input.payers.map((payer) => ({ memberId: payer.memberId, amount: payer.amount })),
      participants: input.participants.map((participant) => ({
        memberId: participant.memberId,
        allocationValue: participant.allocationValue ?? 1,
      })),
    }
    issues.push(...validateSplit(splitInput))

    if (issues.length > 0) throw validationError(issues)

    return {
      payers: splitInput.payers,
      participants: computeParticipantAmounts(splitInput),
    }
  }

  const describeExpense = (expense: Expense) =>
    `"${expense.description}" for ${formatMoney(expense.totalAmount, expense.currency)}`

  /* ---------------------------------------------------------------------- */
  /* Service                                                                */
  /* ---------------------------------------------------------------------- */

  const service: EvenlyService = {
    auth: {
      getSession: () =>
        query<Session>(() => {
          const user = currentUser()
          return { user: user ? publicUser(user) : null }
        }),

      register: (input: RegisterInput) =>
        transaction<Session>(() => {
          const issues: ValidationIssue[] = []
          if (!input.name.trim()) {
            issues.push({ field: 'description', message: 'Enter your name.' })
          }
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) {
            issues.push({ field: 'description', message: 'Enter a valid email address.' })
          }
          if (input.password.length < 8) {
            issues.push({ field: 'description', message: 'Use a password of at least 8 characters.' })
          }
          if (issues.length > 0) throw validationError(issues)

          const email = input.email.trim().toLowerCase()
          if (db.users.some((user) => user.email.toLowerCase() === email)) {
            throw new ServiceError('conflict', 'An account already uses that email address.')
          }

          const user: StoredUser = {
            id: newId('usr'),
            name: input.name.trim(),
            email,
            password: input.password,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          }
          db.users.push(user)
          db.sessionUserId = user.id
          return { user: publicUser(user) }
        }),

      login: (input: LoginInput) =>
        transaction<Session>(() => {
          const email = input.email.trim().toLowerCase()
          const user = db.users.find((candidate) => candidate.email.toLowerCase() === email)
          if (!user || user.password !== input.password) {
            throw new ServiceError('unauthenticated', 'That email and password do not match.')
          }
          db.sessionUserId = user.id
          return { user: publicUser(user) }
        }),

      logout: () =>
        transaction<void>(() => {
          db.sessionUserId = null
        }),
    },

    dashboard: {
      get: () =>
        query<DashboardData>(() => {
          const user = currentUser()
          const groups = accessibleGroups()
          const summaries = groups.map((group) => summarize(group))

          const saved = summaries
            .filter((summary) => summary.group.kind === 'group')
            .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
          const quick = summaries
            .filter((summary) => summary.group.kind === 'quick')
            .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))

          const totals = summaries.reduce(
            (acc, summary) => {
              if (!summary.viewerDebts) return acc
              return {
                owes: acc.owes + summary.viewerDebts.owes,
                owed: acc.owed + summary.viewerDebts.owed,
                net: 0,
              }
            },
            { owes: 0, owed: 0, net: 0 },
          )
          totals.net = totals.owed - totals.owes

          const groupIds = new Set(groups.map((group) => group.id))
          const recentActivity = db.activities
            .filter((activity) => groupIds.has(activity.groupId))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 12)

          const unreadNotifications = user
            ? db.notifications.filter(
                (notification) => notification.userId === user.id && !notification.readAt,
              ).length
            : 0

          return {
            user: user ? publicUser(user) : null,
            groups: saved,
            quickSplits: quick,
            totals,
            recentActivity,
            unreadNotifications,
          }
        }),
    },
    budgets: {
      list: () =>
        query(() => {
          const user = requireUser()
          return db.budgets.filter((budget) => budget.userId === user.id).map(budgetTotals)
        }),
      get: (budgetId) =>
        query(() => {
          const user = requireUser()
          const budget = db.budgets.find((candidate) => candidate.id === budgetId && candidate.userId === user.id)
          if (!budget) throw notFound('That personal budget')
          return budgetTotals(budget)
        }),
      create: (input) =>
        transaction(() => {
          const user = requireUser()
          if (!input.name.trim()) throw validationError([{ field: 'description', message: 'Give the budget a name.' }])
          const now = nowIso()
          const budget: PersonalBudget = { id: newId('bud'), userId: user.id, name: input.name.trim(), currency: input.currency ?? 'NGN', totalAmount: 0, paidAmount: 0, remainingAmount: 0, items: [] }
          db.budgets.push(budget)
          return { ...budget, createdAt: now } as PersonalBudget
        }),
      addItem: (budgetId, input) =>
        transaction(() => {
          const user = requireUser()
          const budget = db.budgets.find((candidate) => candidate.id === budgetId && candidate.userId === user.id)
          if (!budget) throw notFound('That personal budget')
          if (!input.name.trim() || input.amount <= 0) throw validationError([{ field: 'description', message: 'Enter an expense name and a positive amount.' }])
          const now = nowIso()
          budget.items.push({ id: newId('bit'), budgetId, name: input.name.trim(), amount: input.amount, isPaid: false, createdAt: now, updatedAt: now })
          return budgetTotals(budget)
        }),
      updateItem: (budgetId, itemId, input) =>
        transaction(() => {
          const user = requireUser()
          const budget = db.budgets.find((candidate) => candidate.id === budgetId && candidate.userId === user.id)
          const item = budget?.items.find((candidate) => candidate.id === itemId)
          if (!budget || !item) throw notFound('That budget expense')
          if (input.name !== undefined) item.name = input.name.trim()
          if (input.amount !== undefined) item.amount = input.amount
          if (input.isPaid !== undefined) item.isPaid = input.isPaid
          item.updatedAt = nowIso()
          return budgetTotals(budget)
        }),
      removeItem: (budgetId, itemId) =>
        transaction(() => {
          const user = requireUser()
          const budget = db.budgets.find((candidate) => candidate.id === budgetId && candidate.userId === user.id)
          if (!budget) throw notFound('That personal budget')
          const before = budget.items.length
          budget.items = budget.items.filter((item) => item.id !== itemId)
          if (budget.items.length === before) throw notFound('That budget expense')
          return budgetTotals(budget)
        }),
    },

    groups: {
      list: () =>
        query<GroupSummary[]>(() =>
          accessibleGroups()
            .filter((group) => group.kind === 'group')
            .map((group) => summarize(group))
            .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)),
        ),

      create: (input: CreateGroupInput) =>
        transaction<Group>(() => {
          const user = requireUser()
          if (!input.name.trim()) {
            throw validationError([{ field: 'description', message: 'Give the group a name.' }])
          }

          const group: Group = {
            id: newId('grp'),
            kind: 'group',
            name: input.name.trim(),
            description: input.description?.trim() ?? '',
            ownerId: user.id,
            currency: input.currency ?? DEFAULT_CURRENCY,
            inviteToken: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          }
          db.groups.push(group)

          const admin: GroupMember = {
            id: newId('mbr'),
            groupId: group.id,
            userId: user.id,
            displayName: firstName(user.name),
            role: 'admin',
            joinedAt: nowIso(),
          }
          db.members.push(admin)
          recordActivity(group, admin, 'group_created', 'group', group.id, `${admin.displayName} created the group`)

          for (const name of input.memberNames ?? []) {
            if (!name.trim()) continue
            const member: GroupMember = {
              id: newId('mbr'),
              groupId: group.id,
              userId: null,
              displayName: name.trim(),
              role: 'member',
              joinedAt: nowIso(),
            }
            db.members.push(member)
            recordActivity(
              group,
              admin,
              'member_added',
              'member',
              member.id,
              `${admin.displayName} added ${member.displayName}`,
            )
          }

          return group
        }),

      get: (groupId: Id) =>
        query<GroupDetail>(() => {
          const group = getGroup(groupId)
          const viewer = requireAccess(group)
          return {
            group,
            members: membersOf(group.id),
            expenses: liveExpensesOf(group.id).sort(
              (a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt),
            ),
            balances: balancesFor(group),
            settlements: settlementsOf(group.id).sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
            activities: db.activities
              .filter((activity) => activity.groupId === group.id)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
            viewer,
          }
        }),

      update: (groupId, input) =>
        transaction<Group>(() => {
          const group = getGroup(groupId)
          const viewer = requireAccess(group)
          if (!viewer.canEditGroup) throw forbidden('Only a group admin can edit group details.')
          const actor = db.members.find((member) => member.id === viewer.memberId) ?? null

          if (input.name !== undefined) {
            if (!input.name.trim()) {
              throw validationError([{ field: 'description', message: 'Give the group a name.' }])
            }
            group.name = input.name.trim()
          }
          if (input.description !== undefined) group.description = input.description.trim()
          group.updatedAt = nowIso()

          recordActivity(group, actor, 'group_updated', 'group', group.id, `${actor?.displayName ?? 'Someone'} updated the group details`)
          return group
        }),

      createQuickSplit: (input: CreateQuickSplitInput) =>
        transaction<Group>(() => {
          const names = input.memberNames.map((name) => name.trim()).filter(Boolean)
          if (names.length < 2) {
            throw validationError([
              { field: 'participants', message: 'Add at least two people to split between.' },
            ])
          }
          if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
            throw validationError([{ field: 'participants', message: 'Use a different name for each person.' }])
          }

          const user = currentUser()
          const defaultName = `Quick Split — ${new Date().toLocaleDateString('en-NG', {
            day: 'numeric',
            month: 'short',
          })}`
          const group: Group = {
            id: newId('qsp'),
            kind: 'quick',
            name: input.name?.trim() || defaultName,
            description: '',
            // A guest's quick split has no owner until they save it to an account.
            ownerId: user?.id ?? null,
            currency: DEFAULT_CURRENCY,
            inviteToken: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          }
          db.groups.push(group)

          names.forEach((name, index) => {
            db.members.push({
              id: newId('mbr'),
              groupId: group.id,
              // The first person is the viewer, so link their account when there is one.
              userId: index === 0 ? (user?.id ?? null) : null,
              displayName: name,
              role: index === 0 ? 'admin' : 'member',
              joinedAt: nowIso(),
            })
          })

          return group
        }),

      saveQuickSplit: (groupId) =>
        transaction<Group>(() => {
          const user = requireUser()
          const group = getGroup(groupId)
          if (group.kind !== 'quick') {
            throw new ServiceError('conflict', 'That is already a saved group.')
          }
          if (group.ownerId && group.ownerId !== user.id) {
            throw forbidden('That quick split belongs to someone else.')
          }

          group.ownerId = user.id
          group.kind = 'group'
          group.updatedAt = nowIso()

          const members = membersOf(group.id)
          const first = members[0]
          if (first && !first.userId) first.userId = user.id

          recordActivity(group, first ?? null, 'group_created', 'group', group.id, `${first?.displayName ?? 'Someone'} saved this quick split as a group`)
          return group
        }),

      addMember: (groupId, displayName) =>
        transaction<GroupMember>(() => {
          const group = getGroup(groupId)
          const viewer = requireAccess(group)
          if (!viewer.canManageMembers) throw forbidden('Only a group admin can add members.')

          const name = displayName.trim()
          if (!name) throw validationError([{ field: 'participants', message: 'Enter a name.' }])
          const members = membersOf(group.id)
          if (members.some((member) => member.displayName.toLowerCase() === name.toLowerCase())) {
            throw new ServiceError('conflict', `${name} is already in this group.`)
          }

          const actor = db.members.find((member) => member.id === viewer.memberId) ?? null
          const member: GroupMember = {
            id: newId('mbr'),
            groupId: group.id,
            userId: null,
            displayName: name,
            role: 'member',
            joinedAt: nowIso(),
          }
          db.members.push(member)
          recordActivity(group, actor, 'member_added', 'member', member.id, `${actor?.displayName ?? 'Someone'} added ${name}`)
          return member
        }),

      removeMember: (groupId, memberId) =>
        transaction<void>(() => {
          const group = getGroup(groupId)
          const viewer = requireAccess(group)
          if (!viewer.canManageMembers) throw forbidden('Only a group admin can remove members.')

          const member = db.members.find(
            (candidate) => candidate.id === memberId && candidate.groupId === groupId,
          )
          if (!member) throw notFound('That member')
          if (member.role === 'admin') {
            throw new ServiceError('conflict', 'The group admin cannot be removed.')
          }

          // Removing someone who appears in the ledger would break the balances,
          // so their expenses have to be resolved first.
          const involved = liveExpensesOf(groupId).some(
            (expense) =>
              expense.payers.some((payer) => payer.memberId === memberId) ||
              expense.participants.some((participant) => participant.memberId === memberId),
          )
          if (involved) {
            throw new ServiceError(
              'conflict',
              `${member.displayName} still appears in this group's expenses, so they cannot be removed.`,
            )
          }

          const actor = db.members.find((candidate) => candidate.id === viewer.memberId) ?? null
          db.members = db.members.filter((candidate) => candidate.id !== memberId)
          recordActivity(group, actor, 'member_removed', 'member', memberId, `${actor?.displayName ?? 'Someone'} removed ${member.displayName}`)
        }),

      createInviteLink: (groupId) =>
        transaction<{ token: string }>(() => {
          const group = getGroup(groupId)
          const viewer = requireAccess(group)
          if (!viewer.canManageInvite) throw forbidden('Only a group admin can manage the invite link.')

          group.inviteToken = newToken()
          group.updatedAt = nowIso()
          const actor = db.members.find((member) => member.id === viewer.memberId) ?? null
          recordActivity(group, actor, 'invite_link_created', 'invite', null, `${actor?.displayName ?? 'Someone'} created a new invite link`)
          return { token: group.inviteToken }
        }),

      revokeInviteLink: (groupId) =>
        transaction<void>(() => {
          const group = getGroup(groupId)
          const viewer = requireAccess(group)
          if (!viewer.canManageInvite) throw forbidden('Only a group admin can manage the invite link.')

          group.inviteToken = null
          group.updatedAt = nowIso()
          const actor = db.members.find((member) => member.id === viewer.memberId) ?? null
          recordActivity(group, actor, 'invite_link_revoked', 'invite', null, `${actor?.displayName ?? 'Someone'} revoked the invite link`)
        }),

      previewInvite: (token) =>
        query<InvitePreview>(() => {
          const group = db.groups.find((candidate) => candidate.inviteToken === token)
          if (!group) {
            return { groupId: '', groupName: '', memberCount: 0, valid: false }
          }
          return {
            groupId: group.id,
            groupName: group.name,
            memberCount: membersOf(group.id).length,
            valid: true,
          }
        }),

      acceptInvite: (token, displayName) =>
        transaction<GroupMember>(() => {
          const user = requireUser()
          const group = db.groups.find((candidate) => candidate.inviteToken === token)
          if (!group) throw notFound('That invite link')

          const existing = membersOf(group.id).find((member) => member.userId === user.id)
          if (existing) return existing

          const name = (displayName?.trim() || firstName(user.name)).trim()
          const member: GroupMember = {
            id: newId('mbr'),
            groupId: group.id,
            userId: user.id,
            displayName: name,
            role: 'member',
            joinedAt: nowIso(),
          }
          db.members.push(member)
          recordActivity(group, member, 'member_joined', 'member', member.id, `${name} joined using an invite link`)
          notifyGroup(group, member, 'group_invitation', `${name} joined ${group.name}`, `${name} joined the group using an invite link.`)
          return member
        }),

      inviteUserByEmail: (groupId, email) =>
        transaction<void>(() => {
          const group = getGroup(groupId)
          const viewer = requireAccess(group)
          if (!viewer.canManageInvite) throw forbidden('Only a group admin can invite people.')

          const normalized = email.trim().toLowerCase()
          const invitee = db.users.find((user) => user.email.toLowerCase() === normalized)
          if (!invitee) {
            // MVP notifications are in-app only, so there is nowhere to send an
            // invitation for an address with no account behind it.
            throw notFound('An Evenly account with that email address')
          }
          if (membersOf(group.id).some((member) => member.userId === invitee.id)) {
            throw new ServiceError('conflict', 'They are already in this group.')
          }
          if (!group.inviteToken) group.inviteToken = newToken()

          const actor = db.members.find((member) => member.id === viewer.memberId) ?? null
          db.notifications.push({
            id: newId('ntf'),
            userId: invitee.id,
            groupId: group.id,
            type: 'group_invitation',
            title: `Invitation to join ${group.name}`,
            message: `${actor?.displayName ?? 'Someone'} invited you to join ${group.name}.`,
            readAt: null,
            createdAt: nowIso(),
          })
          recordActivity(group, actor, 'invite_link_created', 'invite', null, `${actor?.displayName ?? 'Someone'} invited ${invitee.name}`)
        }),
    },

    expenses: {
      create: (input: ExpenseInput) =>
        transaction<Expense>(() => {
          const group = getGroup(input.groupId)
          const actor = requireActingMember(group)
          const members = membersOf(group.id)
          const { payers, participants } = resolveExpenseParts(input, members)

          const expense: Expense = {
            id: newId('exp'),
            groupId: group.id,
            createdBy: actor.id,
            description: input.description.trim(),
            totalAmount: input.totalAmount,
            currency: group.currency,
            expenseDate: input.expenseDate || todayIso(),
            splitMethod: input.splitMethod,
            payers,
            participants,
            receipt: input.receipt
              ? {
                  id: newId('rcp'),
                  expenseId: '',
                  fileName: input.receipt.fileName,
                  fileUrl: input.receipt.fileUrl,
                  createdAt: nowIso(),
                }
              : null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
            deletedAt: null,
          }
          if (expense.receipt) expense.receipt.expenseId = expense.id
          db.expenses.push(expense)

          recordActivity(group, actor, 'expense_created', 'expense', expense.id, `${actor.displayName} added ${describeExpense(expense)}`)
          notifyGroup(group, actor, 'expense_created', `New expense in ${group.name}`, `${actor.displayName} added ${describeExpense(expense)}`)
          return expense
        }),

      update: (expenseId, input) =>
        transaction<Expense>(() => {
          const expense = db.expenses.find((candidate) => candidate.id === expenseId)
          if (!expense || expense.deletedAt) throw notFound('That expense')
          const group = getGroup(expense.groupId)
          const actor = requireActingMember(group)
          if (expense.createdBy !== actor.id) {
            throw forbidden('Only the person who added an expense can edit it.')
          }

          const members = membersOf(group.id)
          const { payers, participants } = resolveExpenseParts(input, members)

          expense.description = input.description.trim()
          expense.totalAmount = input.totalAmount
          expense.expenseDate = input.expenseDate || expense.expenseDate
          expense.splitMethod = input.splitMethod
          expense.payers = payers
          expense.participants = participants
          expense.updatedAt = nowIso()
          if (input.receipt !== undefined) {
            expense.receipt = input.receipt
              ? {
                  id: expense.receipt?.id ?? newId('rcp'),
                  expenseId: expense.id,
                  fileName: input.receipt.fileName,
                  fileUrl: input.receipt.fileUrl,
                  createdAt: expense.receipt?.createdAt ?? nowIso(),
                }
              : null
          }

          recordActivity(group, actor, 'expense_edited', 'expense', expense.id, `${actor.displayName} edited ${describeExpense(expense)}`)
          notifyGroup(group, actor, 'expense_edited', `Expense changed in ${group.name}`, `${actor.displayName} edited ${describeExpense(expense)}`)
          return expense
        }),

      remove: (expenseId) =>
        transaction<void>(() => {
          const expense = db.expenses.find((candidate) => candidate.id === expenseId)
          if (!expense || expense.deletedAt) throw notFound('That expense')
          const group = getGroup(expense.groupId)
          const actor = requireActingMember(group)
          if (expense.createdBy !== actor.id) {
            throw forbidden('Only the person who added an expense can delete it.')
          }

          // Soft delete: the ledger drops it, the audit trail keeps it.
          expense.deletedAt = nowIso()
          expense.updatedAt = expense.deletedAt

          recordActivity(group, actor, 'expense_deleted', 'expense', expense.id, `${actor.displayName} deleted ${describeExpense(expense)}`)
          notifyGroup(group, actor, 'expense_deleted', `Expense deleted in ${group.name}`, `${actor.displayName} deleted ${describeExpense(expense)}`)
        }),

      get: (expenseId) =>
        query<Expense>(() => {
          const expense = db.expenses.find((candidate) => candidate.id === expenseId)
          if (!expense || expense.deletedAt) throw notFound('That expense')
          requireAccess(getGroup(expense.groupId))
          return expense
        }),
    },

    settlements: {
      markDebtPaid: (input: MarkPaidInput) =>
        transaction<Settlement>(() => {
          const group = getGroup(input.groupId)
          const actor = requireActingMember(group)
          const viewer = viewerContext(group)

          const isParty = actor.id === input.fromMemberId || actor.id === input.toMemberId
          if (!isParty && !viewer.isAdmin) {
            throw forbidden('Only someone involved in a debt, or a group admin, can mark it paid.')
          }
          if (input.fromMemberId === input.toMemberId) {
            throw validationError([{ field: 'participants', message: 'Pick two different people.' }])
          }
          if (input.amount <= 0) {
            throw validationError([{ field: 'totalAmount', message: 'Amount must be greater than zero.' }])
          }

          const debt = balancesFor(group).debts.find(
            (candidate) =>
              candidate.fromMemberId === input.fromMemberId && candidate.toMemberId === input.toMemberId,
          )
          if (!debt) throw notFound('That debt')
          if (input.amount > debt.outstandingAmount) {
            throw validationError([
              {
                field: 'totalAmount',
                message: `Only ${formatMoney(debt.outstandingAmount, group.currency)} is outstanding.`,
              },
            ])
          }

          const members = membersOf(group.id)
          const nameOf = (memberId: Id) =>
            members.find((member) => member.id === memberId)?.displayName ?? 'Someone'

          const settlement: Settlement = {
            id: newId('stl'),
            groupId: group.id,
            fromMemberId: input.fromMemberId,
            toMemberId: input.toMemberId,
            amount: input.amount,
            status: 'paid',
            paidAt: nowIso(),
            markedPaidBy: actor.id,
            createdAt: nowIso(),
          }
          db.settlements.push(settlement)

          const summary = `${actor.displayName} marked ${formatMoney(input.amount, group.currency)} from ${nameOf(
            input.fromMemberId,
          )} to ${nameOf(input.toMemberId)} as paid`
          recordActivity(group, actor, 'debt_marked_paid', 'settlement', settlement.id, summary)
          notifyGroup(group, actor, 'debt_marked_paid', `Debt marked paid in ${group.name}`, summary)
          return settlement
        }),
    },

    notifications: {
      list: () =>
        query<AppNotification[]>(() => {
          const user = requireUser()
          return db.notifications
            .filter((notification) => notification.userId === user.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        }),

      unreadCount: () =>
        query<number>(() => {
          const user = currentUser()
          if (!user) return 0
          return db.notifications.filter(
            (notification) => notification.userId === user.id && !notification.readAt,
          ).length
        }),

      markRead: (notificationId) =>
        transaction<void>(() => {
          const user = requireUser()
          const notification = db.notifications.find(
            (candidate) => candidate.id === notificationId && candidate.userId === user.id,
          )
          if (!notification) throw notFound('That notification')
          notification.readAt = notification.readAt ?? nowIso()
        }),

      markAllRead: () =>
        transaction<void>(() => {
          const user = requireUser()
          for (const notification of db.notifications) {
            if (notification.userId === user.id && !notification.readAt) {
              notification.readAt = nowIso()
            }
          }
        }),
    },

    uploads: {
      uploadReceipt: (file: File) =>
        new Promise<UploadedFile>((resolve, reject) => {
          if (!file.type.startsWith('image/')) {
            reject(validationError([{ field: 'description', message: 'Attach an image file.' }]))
            return
          }
          const maxBytes = 5 * 1024 * 1024
          if (file.size > maxBytes) {
            reject(validationError([{ field: 'description', message: 'Receipts must be under 5MB.' }]))
            return
          }
          // A real backend would put this in object storage and hand back a signed
          // URL; the mock keeps the bytes inline as a data URL.
          const reader = new FileReader()
          reader.onerror = () => reject(new ServiceError('validation', 'That file could not be read.'))
          reader.onload = () =>
            resolve({ fileName: file.name, fileUrl: String(reader.result ?? '') })
          reader.readAsDataURL(file)
        }),
    },
  }

  return service
}
