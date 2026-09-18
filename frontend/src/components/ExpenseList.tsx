import { useState } from 'react'
import { formatMoney } from '../domain/money'
import { expenseDebtEdges } from '../domain/split'
import type { Expense, GroupMember, Id } from '../domain/types'
import { useMutation } from '../hooks/useQuery'
import type { GroupDetail } from '../services/types'
import { EmptyState, ErrorNotice, Modal, formatDate } from './ui'
import { ExpenseForm } from './ExpenseForm'

const SPLIT_LABELS: Record<Expense['splitMethod'], string> = {
  equal: 'Equal split',
  custom: 'Custom amounts',
  percentage: 'Percentages',
  shares: 'Shares',
}

function payerSummary(expense: Expense, nameOf: (id: Id) => string): string {
  if (expense.payers.length === 1) return `${nameOf(expense.payers[0].memberId)} paid`
  return `${expense.payers.map((payer) => `${nameOf(payer.memberId)} ${formatMoney(payer.amount, expense.currency)}`).join(' · ')}`
}

export function ExpenseList({ detail, onChanged }: { detail: GroupDetail; onChanged: () => void }) {
  const { group, members, expenses, viewer } = detail
  const [editing, setEditing] = useState<Expense | null>(null)
  const [expanded, setExpanded] = useState<Id | null>(null)

  const nameOf = (memberId: Id) =>
    members.find((member: GroupMember) => member.id === memberId)?.displayName ?? 'Someone'

  const removeExpense = useMutation((service, expenseId: Id) => service.expenses.remove(expenseId), {
    onSuccess: onChanged,
  })

  if (expenses.length === 0) {
    return (
      <EmptyState
        title="No expenses yet"
        body="Add the first expense and Evenly will work out who owes whom."
      />
    )
  }

  return (
    <>
      <ErrorNotice error={removeExpense.error} />
      <ul className="expense-list">
        {expenses.map((expense) => {
          const isMine = expense.createdBy === viewer.memberId
          const open = expanded === expense.id
          const debtEdges = expenseDebtEdges(expense)
          return (
            <li key={expense.id} className="expense">
              <button
                type="button"
                className="expense-head"
                onClick={() => setExpanded(open ? null : expense.id)}
                aria-expanded={open}
              >
                <span className="expense-main">
                  <strong>{expense.description}</strong>
                  <span className="muted small">
                    {formatDate(expense.expenseDate)} · {payerSummary(expense, nameOf)} ·{' '}
                    {SPLIT_LABELS[expense.splitMethod]}
                    {expense.receipt ? ' · 📎 receipt' : ''}
                  </span>
                </span>
                <span className="expense-amount">{formatMoney(expense.totalAmount, expense.currency)}</span>
              </button>

              {open && (
                <div className="expense-detail">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th className="right">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expense.participants.map((participant) => (
                        <tr key={participant.memberId}>
                          <td>{nameOf(participant.memberId)}</td>
                          <td className="right">
                            {formatMoney(participant.calculatedAmount, expense.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="expense-debts">
                    <h3>Who owes whom</h3>
                    {debtEdges.length === 0 ? (
                      <p className="muted small">Everyone is settled for this expense.</p>
                    ) : (
                      <ul className="plain expense-debt-list">
                        {debtEdges.map((edge, index) => (
                          <li key={`${edge.fromMemberId}-${edge.toMemberId}-${index}`}>
                            <strong>{nameOf(edge.fromMemberId)}</strong> owes{' '}
                            <strong>{nameOf(edge.toMemberId)}</strong>{' '}
                            {formatMoney(edge.amount, expense.currency)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {expense.receipt && (
                    <figure className="receipt-preview">
                      <img src={expense.receipt.fileUrl} alt={`Receipt for ${expense.description}`} />
                      <figcaption className="muted small">{expense.receipt.fileName}</figcaption>
                    </figure>
                  )}

                  <div className="expense-actions">
                    <span className="muted small">Added by {nameOf(expense.createdBy)}</span>
                    {isMine ? (
                      <span className="inline-actions">
                        <button type="button" className="link" onClick={() => setEditing(expense)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="link danger"
                          disabled={removeExpense.pending}
                          onClick={async () => {
                            if (!window.confirm(`Delete "${expense.description}"?`)) return
                            await removeExpense.mutate(expense.id)
                          }}
                        >
                          Delete
                        </button>
                      </span>
                    ) : (
                      <span className="muted small">Only {nameOf(expense.createdBy)} can change this</span>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {editing && (
        <Modal title="Edit expense" wide onClose={() => setEditing(null)}>
          <ExpenseForm
            group={group}
            members={members}
            expense={editing}
            onSaved={() => {
              setEditing(null)
              onChanged()
            }}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </>
  )
}
