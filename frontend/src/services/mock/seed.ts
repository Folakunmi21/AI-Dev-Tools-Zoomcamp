import { DEFAULT_CURRENCY, fromMajor } from '../../domain/money'
import { computeParticipantAmounts } from '../../domain/split'
import type {
  Activity,
  ActivityAction,
  AppNotification,
  Expense,
  Group,
  GroupMember,
  Id,
  SplitMethod,
} from '../../domain/types'
import { emptyDb, type MockDb } from './db'

/** The demo account, shown on the sign-in screen so the app is usable immediately. */
export const DEMO_CREDENTIALS = { email: 'ada@evenly.app', password: 'password' }

const daysAgo = (days: number, hour = 9): string => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

const dateOnly = (iso: string): string => iso.slice(0, 10)

interface SeedExpense {
  id: Id
  groupId: Id
  createdBy: Id
  description: string
  totalMajor: number
  daysAgo: number
  splitMethod: SplitMethod
  payers: Array<{ memberId: Id; amountMajor: number }>
  participants: Array<{ memberId: Id; allocationValue?: number }>
}

function buildExpense(seed: SeedExpense): Expense {
  const totalAmount = fromMajor(seed.totalMajor)
  const participants = computeParticipantAmounts({
    totalAmount,
    splitMethod: seed.splitMethod,
    payers: seed.payers.map((payer) => ({
      memberId: payer.memberId,
      amount: fromMajor(payer.amountMajor),
    })),
    participants: seed.participants.map((participant) => ({
      memberId: participant.memberId,
      allocationValue: participant.allocationValue ?? 1,
    })),
  })

  const createdAt = daysAgo(seed.daysAgo, 20)
  return {
    id: seed.id,
    groupId: seed.groupId,
    createdBy: seed.createdBy,
    description: seed.description,
    totalAmount,
    currency: DEFAULT_CURRENCY,
    expenseDate: dateOnly(daysAgo(seed.daysAgo)),
    splitMethod: seed.splitMethod,
    payers: seed.payers.map((payer) => ({
      memberId: payer.memberId,
      amount: fromMajor(payer.amountMajor),
    })),
    participants,
    receipt: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  }
}

/**
 * Seed the mock backend with a group that already has history, so every screen
 * (balances, activity, notifications) has something real to show on first load.
 */
export function seedDb(): MockDb {
  const db = emptyDb()

  db.users = [
    {
      id: 'usr_ada',
      name: 'Ada Eze',
      email: DEMO_CREDENTIALS.email,
      password: DEMO_CREDENTIALS.password,
      createdAt: daysAgo(60),
      updatedAt: daysAgo(60),
    },
    {
      id: 'usr_kunmi',
      name: 'Kunmi Bello',
      email: 'kunmi@evenly.app',
      password: 'password',
      createdAt: daysAgo(58),
      updatedAt: daysAgo(58),
    },
    {
      id: 'usr_tobi',
      name: 'Tobi Okafor',
      email: 'tobi@evenly.app',
      password: 'password',
      createdAt: daysAgo(57),
      updatedAt: daysAgo(57),
    },
  ]

  const lagos: Group = {
    id: 'grp_lagos',
    kind: 'group',
    name: 'Lagos Trip',
    description: 'Four days in Lagos — flights, Airbnb and far too much suya.',
    ownerId: 'usr_ada',
    currency: DEFAULT_CURRENCY,
    inviteToken: 'lagos-invite-demo',
    createdAt: daysAgo(21),
    updatedAt: daysAgo(3),
  }

  const apartment: Group = {
    id: 'grp_apartment',
    kind: 'group',
    name: 'Apartment Expenses',
    description: 'Shared bills for the Yaba flat.',
    ownerId: 'usr_kunmi',
    currency: DEFAULT_CURRENCY,
    inviteToken: null,
    createdAt: daysAgo(40),
    updatedAt: daysAgo(6),
  }

  db.groups = [lagos, apartment]

  const members: GroupMember[] = [
    {
      id: 'mbr_lagos_ada',
      groupId: lagos.id,
      userId: 'usr_ada',
      displayName: 'Ada',
      role: 'admin',
      joinedAt: daysAgo(21),
    },
    {
      id: 'mbr_lagos_kunmi',
      groupId: lagos.id,
      userId: 'usr_kunmi',
      displayName: 'Kunmi',
      role: 'member',
      joinedAt: daysAgo(20),
    },
    {
      id: 'mbr_lagos_tobi',
      groupId: lagos.id,
      userId: 'usr_tobi',
      displayName: 'Tobi',
      role: 'member',
      joinedAt: daysAgo(20),
    },
    {
      id: 'mbr_lagos_zainab',
      groupId: lagos.id,
      userId: null,
      displayName: 'Zainab',
      role: 'member',
      joinedAt: daysAgo(19),
    },
    {
      id: 'mbr_apt_kunmi',
      groupId: apartment.id,
      userId: 'usr_kunmi',
      displayName: 'Kunmi',
      role: 'admin',
      joinedAt: daysAgo(40),
    },
    {
      id: 'mbr_apt_ada',
      groupId: apartment.id,
      userId: 'usr_ada',
      displayName: 'Ada',
      role: 'member',
      joinedAt: daysAgo(40),
    },
  ]
  db.members = members

  db.expenses = [
    buildExpense({
      id: 'exp_airbnb',
      groupId: lagos.id,
      createdBy: 'mbr_lagos_ada',
      description: 'Airbnb in Lekki',
      totalMajor: 120_000,
      daysAgo: 18,
      splitMethod: 'shares',
      // Ada took the en-suite, so she carries two shares.
      payers: [
        { memberId: 'mbr_lagos_ada', amountMajor: 80_000 },
        { memberId: 'mbr_lagos_tobi', amountMajor: 40_000 },
      ],
      participants: [
        { memberId: 'mbr_lagos_ada', allocationValue: 2 },
        { memberId: 'mbr_lagos_kunmi', allocationValue: 1 },
        { memberId: 'mbr_lagos_tobi', allocationValue: 1 },
        { memberId: 'mbr_lagos_zainab', allocationValue: 1 },
      ],
    }),
    buildExpense({
      id: 'exp_dinner',
      groupId: lagos.id,
      createdBy: 'mbr_lagos_ada',
      description: 'Dinner at Nok',
      totalMajor: 45_000,
      daysAgo: 17,
      splitMethod: 'equal',
      payers: [{ memberId: 'mbr_lagos_ada', amountMajor: 45_000 }],
      participants: [
        { memberId: 'mbr_lagos_ada' },
        { memberId: 'mbr_lagos_kunmi' },
        { memberId: 'mbr_lagos_tobi' },
        { memberId: 'mbr_lagos_zainab' },
      ],
    }),
    buildExpense({
      id: 'exp_uber',
      groupId: lagos.id,
      createdBy: 'mbr_lagos_kunmi',
      description: 'Uber to the airport',
      totalMajor: 8_500,
      daysAgo: 3,
      splitMethod: 'equal',
      payers: [{ memberId: 'mbr_lagos_kunmi', amountMajor: 8_500 }],
      participants: [
        { memberId: 'mbr_lagos_kunmi' },
        { memberId: 'mbr_lagos_tobi' },
        { memberId: 'mbr_lagos_ada' },
      ],
    }),
    buildExpense({
      id: 'exp_electricity',
      groupId: apartment.id,
      createdBy: 'mbr_apt_kunmi',
      description: 'Electricity (September)',
      totalMajor: 30_000,
      daysAgo: 6,
      splitMethod: 'percentage',
      payers: [{ memberId: 'mbr_apt_kunmi', amountMajor: 30_000 }],
      participants: [
        { memberId: 'mbr_apt_kunmi', allocationValue: 60 },
        { memberId: 'mbr_apt_ada', allocationValue: 40 },
      ],
    }),
  ]

  const activity = (
    id: string,
    groupId: Id,
    actorId: Id,
    actorName: string,
    action: ActivityAction,
    entityType: Activity['entityType'],
    entityId: Id | null,
    summary: string,
    days: number,
  ): Activity => ({
    id,
    groupId,
    actorId,
    actorName,
    action,
    entityType,
    entityId,
    summary,
    createdAt: daysAgo(days, 20),
  })

  db.activities = [
    activity('act_1', lagos.id, 'mbr_lagos_ada', 'Ada', 'group_created', 'group', lagos.id, 'Ada created the group', 21),
    activity('act_2', lagos.id, 'mbr_lagos_ada', 'Ada', 'member_added', 'member', 'mbr_lagos_kunmi', 'Ada added Kunmi', 20),
    activity('act_3', lagos.id, 'mbr_lagos_ada', 'Ada', 'member_added', 'member', 'mbr_lagos_tobi', 'Ada added Tobi', 20),
    activity('act_4', lagos.id, 'mbr_lagos_ada', 'Ada', 'member_added', 'member', 'mbr_lagos_zainab', 'Ada added Zainab', 19),
    activity('act_5', lagos.id, 'mbr_lagos_ada', 'Ada', 'expense_created', 'expense', 'exp_airbnb', 'Ada added "Airbnb in Lekki" for ₦120,000', 18),
    activity('act_6', lagos.id, 'mbr_lagos_ada', 'Ada', 'expense_created', 'expense', 'exp_dinner', 'Ada added "Dinner at Nok" for ₦45,000', 17),
    activity('act_7', lagos.id, 'mbr_lagos_kunmi', 'Kunmi', 'expense_created', 'expense', 'exp_uber', 'Kunmi added "Uber to the airport" for ₦8,500', 3),
    activity('act_8', apartment.id, 'mbr_apt_kunmi', 'Kunmi', 'group_created', 'group', apartment.id, 'Kunmi created the group', 40),
    activity('act_9', apartment.id, 'mbr_apt_kunmi', 'Kunmi', 'member_added', 'member', 'mbr_apt_ada', 'Kunmi added Ada', 40),
    activity('act_10', apartment.id, 'mbr_apt_kunmi', 'Kunmi', 'expense_created', 'expense', 'exp_electricity', 'Kunmi added "Electricity (September)" for ₦30,000', 6),
  ]

  const notification = (
    id: string,
    userId: Id,
    groupId: Id,
    type: AppNotification['type'],
    title: string,
    message: string,
    days: number,
    read: boolean,
  ): AppNotification => ({
    id,
    userId,
    groupId,
    type,
    title,
    message,
    readAt: read ? daysAgo(days - 1, 10) : null,
    createdAt: daysAgo(days, 20),
  })

  db.notifications = [
    notification('ntf_1', 'usr_ada', lagos.id, 'expense_created', 'New expense in Lagos Trip', 'Kunmi added "Uber to the airport" for ₦8,500', 3, false),
    notification('ntf_2', 'usr_ada', apartment.id, 'expense_created', 'New expense in Apartment Expenses', 'Kunmi added "Electricity (September)" for ₦30,000', 6, false),
    notification('ntf_3', 'usr_ada', lagos.id, 'expense_created', 'New expense in Lagos Trip', 'Ada added "Dinner at Nok" for ₦45,000', 17, true),
  ]

  return db
}
