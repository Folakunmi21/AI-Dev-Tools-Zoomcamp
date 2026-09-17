import type { Kobo } from './money'
import { expenseDebtEdges } from './split'
import type {
  DebtEdge,
  Expense,
  Group,
  GroupBalances,
  GroupMember,
  Id,
  MemberBalance,
  PairDebt,
  Settlement,
} from './types'

const pairKey = (from: Id, to: Id) => `${from}->${to}`

/**
 * Compute every member's net position and the outstanding obligations in a group.
 *
 * Deliberate omissions, per the spec:
 * - Debts are never simplified across expenses: `A owes B` and `B owes C` stay as
 *   two obligations and are never rewritten as `A owes C`.
 * - Opposite directions between the same two people are not netted off either;
 *   both obligations stay visible until someone marks one paid.
 * - Settlements never change the expenses. They only reduce what is outstanding.
 */
export function computeGroupBalances(
  group: Group,
  members: GroupMember[],
  expenses: Expense[],
  settlements: Settlement[],
): GroupBalances {
  const liveExpenses = expenses.filter((expense) => !expense.deletedAt)

  const paid = new Map<Id, Kobo>()
  const share = new Map<Id, Kobo>()
  const add = (map: Map<Id, Kobo>, memberId: Id, delta: Kobo) =>
    map.set(memberId, (map.get(memberId) ?? 0) + delta)

  for (const expense of liveExpenses) {
    for (const payer of expense.payers) add(paid, payer.memberId, payer.amount)
    for (const participant of expense.participants) {
      add(share, participant.memberId, participant.calculatedAmount)
    }
  }

  const memberBalances: MemberBalance[] = members.map((member) => {
    const totalPaid = paid.get(member.id) ?? 0
    const totalShare = share.get(member.id) ?? 0
    return {
      memberId: member.id,
      displayName: member.displayName,
      totalPaid,
      totalShare,
      netBalance: totalPaid - totalShare,
    }
  })

  const edgesByPair = new Map<string, DebtEdge[]>()
  for (const expense of liveExpenses) {
    for (const edge of expenseDebtEdges(expense)) {
      const key = pairKey(edge.fromMemberId, edge.toMemberId)
      const existing = edgesByPair.get(key)
      if (existing) existing.push(edge)
      else edgesByPair.set(key, [edge])
    }
  }

  const settledByPair = new Map<string, Kobo>()
  for (const settlement of settlements) {
    const key = pairKey(settlement.fromMemberId, settlement.toMemberId)
    settledByPair.set(key, (settledByPair.get(key) ?? 0) + settlement.amount)
  }

  const debts: PairDebt[] = []
  for (const [key, edges] of edgesByPair) {
    const grossAmount = edges.reduce((acc, edge) => acc + edge.amount, 0)
    const settledAmount = Math.min(settledByPair.get(key) ?? 0, grossAmount)
    debts.push({
      fromMemberId: edges[0].fromMemberId,
      toMemberId: edges[0].toMemberId,
      grossAmount,
      settledAmount,
      outstandingAmount: grossAmount - settledAmount,
      edges: [...edges].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate)),
    })
  }

  const memberOrder = new Map(members.map((member, index) => [member.id, index]))
  debts.sort(
    (a, b) =>
      (memberOrder.get(a.fromMemberId) ?? 0) - (memberOrder.get(b.fromMemberId) ?? 0) ||
      (memberOrder.get(a.toMemberId) ?? 0) - (memberOrder.get(b.toMemberId) ?? 0),
  )

  return {
    groupId: group.id,
    currency: group.currency,
    members: memberBalances,
    debts,
  }
}

export interface MemberDebtSummary {
  owes: Kobo
  owed: Kobo
  net: Kobo
}

/** What a single member currently owes and is owed, from outstanding obligations. */
export function summarizeMemberDebts(balances: GroupBalances, memberId: Id): MemberDebtSummary {
  let owes = 0
  let owed = 0
  for (const debt of balances.debts) {
    if (debt.outstandingAmount === 0) continue
    if (debt.fromMemberId === memberId) owes += debt.outstandingAmount
    if (debt.toMemberId === memberId) owed += debt.outstandingAmount
  }
  return { owes, owed, net: owed - owes }
}
