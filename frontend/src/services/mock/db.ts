import type {
  Activity,
  AppNotification,
  Expense,
  Group,
  GroupMember,
  Id,
  Settlement,
  User,
} from '../../domain/types'

/** A user row, with the credential the mock backend checks against. */
export interface StoredUser extends User {
  password: string
}

/** The whole "database" of the mock backend. Serialisable as JSON on purpose. */
export interface MockDb {
  version: number
  users: StoredUser[]
  groups: Group[]
  members: GroupMember[]
  expenses: Expense[]
  settlements: Settlement[]
  activities: Activity[]
  notifications: AppNotification[]
  sessionUserId: Id | null
}

export const DB_VERSION = 1

/** Minimal storage port so the mock can run in a browser, a test, or neither. */
export interface MockStorage {
  read(): string | null
  write(value: string): void
}

export const memoryStorage = (): MockStorage => {
  let value: string | null = null
  return {
    read: () => value,
    write: (next) => {
      value = next
    },
  }
}

export const browserStorage = (key = 'evenly.mock.db.v1'): MockStorage => ({
  read: () => {
    try {
      return globalThis.localStorage?.getItem(key) ?? null
    } catch {
      return null
    }
  },
  write: (value) => {
    try {
      globalThis.localStorage?.setItem(key, value)
    } catch {
      // Storage unavailable (private mode, SSR). The db still works in memory.
    }
  },
})

export const defaultStorage = (): MockStorage =>
  typeof globalThis.localStorage === 'undefined' ? memoryStorage() : browserStorage()

let idCounter = 0

export function newId(prefix: string): Id {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`
}

export function newToken(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
}

export function emptyDb(): MockDb {
  return {
    version: DB_VERSION,
    users: [],
    groups: [],
    members: [],
    expenses: [],
    settlements: [],
    activities: [],
    notifications: [],
    sessionUserId: null,
  }
}

export function parseDb(raw: string | null): MockDb | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as MockDb
    if (!parsed || parsed.version !== DB_VERSION || !Array.isArray(parsed.users)) return null
    return parsed
  } catch {
    return null
  }
}

export function serializeDb(db: MockDb): string {
  return JSON.stringify(db)
}

export function cloneDb(db: MockDb): MockDb {
  return JSON.parse(JSON.stringify(db)) as MockDb
}

/** Deep copy on the way out so callers cannot mutate the store by accident. */
export function snapshot<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value)) as T
}

export function findExpense(db: MockDb, expenseId: Id): Expense | undefined {
  return db.expenses.find((expense) => expense.id === expenseId)
}

export function groupMembers(db: MockDb, groupId: Id): GroupMember[] {
  return db.members.filter((member) => member.groupId === groupId)
}

export function groupExpenses(db: MockDb, groupId: Id): Expense[] {
  return db.expenses.filter((expense) => expense.groupId === groupId)
}

export function groupSettlements(db: MockDb, groupId: Id): Settlement[] {
  return db.settlements.filter((settlement) => settlement.groupId === groupId)
}
