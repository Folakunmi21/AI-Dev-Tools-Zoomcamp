import { describe, expect, it } from 'vitest'
import { computeGroupBalances } from '../src/domain/balances'
import { allocateByWeight, fromMajor } from '../src/domain/money'
import { computeParticipantAmounts, expenseDebtEdges, validateSplit } from '../src/domain/split'
import type { Expense, Group, GroupMember, Settlement } from '../src/domain/types'

const group: Group = {
  id: 'group',
  kind: 'group',
  name: 'Test group',
  description: '',
  ownerId: 'user-a',
  currency: 'NGN',
  inviteToken: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
}

const members: GroupMember[] = [
  { id: 'a', groupId: group.id, userId: 'user-a', displayName: 'A', role: 'admin', joinedAt: group.createdAt },
  { id: 'b', groupId: group.id, userId: null, displayName: 'B', role: 'member', joinedAt: group.createdAt },
  { id: 'c', groupId: group.id, userId: null, displayName: 'C', role: 'member', joinedAt: group.createdAt },
]

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense',
    groupId: group.id,
    createdBy: 'a',
    description: 'Dinner',
    totalAmount: fromMajor(30),
    currency: 'NGN',
    expenseDate: '2025-01-02',
    splitMethod: 'equal',
    payers: [{ memberId: 'a', amount: fromMajor(30) }],
    participants: [
      { memberId: 'a', allocationValue: 1, calculatedAmount: fromMajor(10) },
      { memberId: 'b', allocationValue: 1, calculatedAmount: fromMajor(10) },
      { memberId: 'c', allocationValue: 1, calculatedAmount: fromMajor(10) },
    ],
    receipt: null,
    createdAt: group.createdAt,
    updatedAt: group.createdAt,
    deletedAt: null,
    ...overrides,
  }
}

describe('split calculations', () => {
  it('allocates exact minor units with deterministic largest remainder', () => {
    expect(allocateByWeight(10, [1, 1, 1])).toEqual([4, 3, 3])
    expect(
      computeParticipantAmounts({
        totalAmount: 100,
        splitMethod: 'percentage',
        payers: [{ memberId: 'a', amount: 100 }],
        participants: [
          { memberId: 'a', allocationValue: 33.33 },
          { memberId: 'b', allocationValue: 33.33 },
          { memberId: 'c', allocationValue: 33.34 },
        ],
      }).map((participant) => participant.calculatedAmount),
    ).toEqual([33, 33, 34])
  })

  it('rejects invalid payer and allocation totals', () => {
    const issues = validateSplit({
      totalAmount: 100,
      splitMethod: 'percentage',
      payers: [{ memberId: 'a', amount: 99 }],
      participants: [
        { memberId: 'a', allocationValue: 40 },
        { memberId: 'b', allocationValue: 40 },
      ],
    })
    expect(issues.map((issue) => issue.field)).toEqual(['payers', 'allocation'])
  })
})

describe('group balances', () => {
  it('keeps obligations per expense and does not simplify chains', () => {
    const first = expense()
    const second = expense({
      id: 'expense-2',
      description: 'Taxi',
      payers: [{ memberId: 'b', amount: fromMajor(30) }],
      participants: [
        { memberId: 'b', allocationValue: 1, calculatedAmount: fromMajor(10) },
        { memberId: 'c', allocationValue: 1, calculatedAmount: fromMajor(20) },
      ],
    })
    const balances = computeGroupBalances(group, members, [first, second], [])
    expect(balances.debts.map((debt) => [debt.fromMemberId, debt.toMemberId])).toEqual([
      ['b', 'a'],
      ['c', 'a'],
      ['c', 'b'],
    ])
    expect(balances.debts.some((debt) => debt.fromMemberId === 'c' && debt.toMemberId === 'a')).toBe(true)
  })

  it('reduces only the matching debt when a settlement is recorded', () => {
    const settlement: Settlement = {
      id: 'settlement',
      groupId: group.id,
      fromMemberId: 'b',
      toMemberId: 'a',
      amount: fromMajor(4),
      status: 'paid',
      paidAt: group.createdAt,
      markedPaidBy: 'a',
      createdAt: group.createdAt,
    }
    const debt = computeGroupBalances(group, members, [expense()], [settlement]).debts.find(
      (item) => item.fromMemberId === 'b' && item.toMemberId === 'a',
    )
    expect(debt).toMatchObject({ grossAmount: 1000, settledAmount: 400, outstandingAmount: 600 })
  })

  it('creates no debt edges for deleted expenses', () => {
    expect(expenseDebtEdges(expense({ deletedAt: '2025-01-03T00:00:00.000Z' }))).toEqual([])
  })
})
