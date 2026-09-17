import { allocateByWeight, sum, type Kobo } from './money'
import type { DebtEdge, Expense, ExpenseParticipant, Id, SplitMethod } from './types'

export interface PayerInput {
  memberId: Id
  amount: Kobo
}

export interface ParticipantInput {
  memberId: Id
  /** kobo for `custom`, percent for `percentage`, share count for `shares`, ignored for `equal`. */
  allocationValue: number
}

export interface SplitInput {
  totalAmount: Kobo
  splitMethod: SplitMethod
  payers: PayerInput[]
  participants: ParticipantInput[]
}

export interface ValidationIssue {
  field: 'description' | 'totalAmount' | 'expenseDate' | 'payers' | 'participants' | 'allocation'
  message: string
}

export const PERCENTAGE_TOTAL = 100

/** Percentages are entered with up to 2 decimals, so compare in basis points. */
const toBasisPoints = (percent: number) => Math.round(percent * 100)

/**
 * Resolve what each participant owes.
 *
 * Callers should validate first: this function never throws, and always returns
 * amounts that sum exactly to `totalAmount` for the proportional methods, but for
 * `custom` it trusts the amounts it is given.
 */
export function computeParticipantAmounts(input: SplitInput): ExpenseParticipant[] {
  const { totalAmount, splitMethod, participants } = input

  if (participants.length === 0) return []

  switch (splitMethod) {
    case 'equal': {
      const amounts = allocateByWeight(
        totalAmount,
        participants.map(() => 1),
      )
      return participants.map((participant, index) => ({
        memberId: participant.memberId,
        allocationValue: 1,
        calculatedAmount: amounts[index],
      }))
    }
    case 'custom': {
      return participants.map((participant) => ({
        memberId: participant.memberId,
        allocationValue: participant.allocationValue,
        calculatedAmount: Math.round(participant.allocationValue),
      }))
    }
    case 'percentage': {
      const amounts = allocateByWeight(
        totalAmount,
        participants.map((participant) => toBasisPoints(participant.allocationValue)),
      )
      return participants.map((participant, index) => ({
        memberId: participant.memberId,
        allocationValue: participant.allocationValue,
        calculatedAmount: amounts[index],
      }))
    }
    case 'shares': {
      const amounts = allocateByWeight(
        totalAmount,
        participants.map((participant) => participant.allocationValue),
      )
      return participants.map((participant, index) => ({
        memberId: participant.memberId,
        allocationValue: participant.allocationValue,
        calculatedAmount: amounts[index],
      }))
    }
  }
}

/** Validate the parts of an expense that affect the split math. */
export function validateSplit(input: SplitInput): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const { totalAmount, splitMethod, payers, participants } = input

  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    issues.push({ field: 'totalAmount', message: 'Amount must be greater than zero.' })
  }

  if (payers.length === 0) {
    issues.push({ field: 'payers', message: 'At least one payer is required.' })
  }
  if (participants.length === 0) {
    issues.push({ field: 'participants', message: 'At least one participant is required.' })
  }

  if (new Set(payers.map((payer) => payer.memberId)).size !== payers.length) {
    issues.push({ field: 'payers', message: 'A person can only be listed as a payer once.' })
  }
  if (new Set(participants.map((participant) => participant.memberId)).size !== participants.length) {
    issues.push({
      field: 'participants',
      message: 'A person can only be listed as a participant once.',
    })
  }

  if (payers.some((payer) => payer.amount <= 0)) {
    issues.push({ field: 'payers', message: 'Each payer must have paid more than zero.' })
  }

  const paid = sum(payers.map((payer) => payer.amount))
  if (payers.length > 0 && totalAmount > 0 && paid !== totalAmount) {
    issues.push({
      field: 'payers',
      message: 'Payer contributions must add up to the expense total.',
    })
  }

  if (participants.length > 0) {
    switch (splitMethod) {
      case 'custom': {
        if (participants.some((participant) => participant.allocationValue < 0)) {
          issues.push({ field: 'allocation', message: 'Custom amounts cannot be negative.' })
          break
        }
        const allocated = sum(participants.map((participant) => Math.round(participant.allocationValue)))
        if (totalAmount > 0 && allocated !== totalAmount) {
          issues.push({
            field: 'allocation',
            message: 'Custom amounts must add up to the expense total.',
          })
        }
        break
      }
      case 'percentage': {
        if (participants.some((participant) => participant.allocationValue < 0)) {
          issues.push({ field: 'allocation', message: 'Percentages cannot be negative.' })
          break
        }
        const totalBasisPoints = participants.reduce(
          (acc, participant) => acc + toBasisPoints(participant.allocationValue),
          0,
        )
        if (totalBasisPoints !== PERCENTAGE_TOTAL * 100) {
          issues.push({ field: 'allocation', message: 'Percentages must add up to 100%.' })
        }
        break
      }
      case 'shares': {
        if (
          participants.some(
            (participant) =>
              !Number.isFinite(participant.allocationValue) || participant.allocationValue <= 0,
          )
        ) {
          issues.push({ field: 'allocation', message: 'Every share must be a positive number.' })
        }
        break
      }
      case 'equal':
        break
    }
  }

  return issues
}

/**
 * Turn one expense into the obligations it creates.
 *
 * Within a single expense each member's position is `paid - owed`; members who
 * are short owe members who are ahead. Amounts are matched greedily in member
 * order, which is exact in minor units (no rounding drift) and deterministic.
 *
 * This is not debt simplification: it resolves a single transaction, and the
 * resulting edges are kept per expense so that chains across different expenses
 * are never collapsed (see `PairDebt`).
 */
export function expenseDebtEdges(expense: Expense): DebtEdge[] {
  if (expense.deletedAt) return []

  const net = new Map<Id, Kobo>()
  const bump = (memberId: Id, delta: Kobo) => net.set(memberId, (net.get(memberId) ?? 0) + delta)

  for (const payer of expense.payers) bump(payer.memberId, payer.amount)
  for (const participant of expense.participants) {
    bump(participant.memberId, -participant.calculatedAmount)
  }

  const debtors: Array<{ memberId: Id; remaining: Kobo }> = []
  const creditors: Array<{ memberId: Id; remaining: Kobo }> = []
  for (const [memberId, balance] of net) {
    if (balance < 0) debtors.push({ memberId, remaining: -balance })
    else if (balance > 0) creditors.push({ memberId, remaining: balance })
  }

  const edges: DebtEdge[] = []
  let creditorIndex = 0
  for (const debtor of debtors) {
    while (debtor.remaining > 0 && creditorIndex < creditors.length) {
      const creditor = creditors[creditorIndex]
      const amount = Math.min(debtor.remaining, creditor.remaining)
      if (amount > 0) {
        edges.push({
          fromMemberId: debtor.memberId,
          toMemberId: creditor.memberId,
          amount,
          expenseId: expense.id,
          expenseDescription: expense.description,
          expenseDate: expense.expenseDate,
        })
        debtor.remaining -= amount
        creditor.remaining -= amount
      }
      if (creditor.remaining === 0) creditorIndex += 1
    }
  }

  return edges
}
