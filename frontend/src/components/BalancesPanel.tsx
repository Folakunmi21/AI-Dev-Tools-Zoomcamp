import { useState } from 'react'
import { amountToInput, formatMoney, parseAmount } from '../domain/money'
import type { Id, PairDebt } from '../domain/types'
import { useMutation } from '../hooks/useQuery'
import type { GroupDetail } from '../services/types'
import { Badge, EmptyState, ErrorNotice, Modal, formatDate } from './ui'

/**
 * Shows every member's net position and every outstanding obligation.
 *
 * Obligations are listed exactly as the expenses produced them: chains such as
 * "Kunmi owes Ada" and "Ada owes Tobi" are never rewritten into a shorter set of
 * payments, which is a deliberate product rule, not an omission.
 */
export function BalancesPanel({ detail, onChanged }: { detail: GroupDetail; onChanged: () => void }) {
  const { group, members, balances, viewer, settlements } = detail
  const [settling, setSettling] = useState<PairDebt | null>(null)

  const nameOf = (memberId: Id) =>
    members.find((member) => member.id === memberId)?.displayName ?? 'Someone'

  const canSettle = (debt: PairDebt) =>
    viewer.isAdmin || viewer.memberId === debt.fromMemberId || viewer.memberId === debt.toMemberId

  const outstanding = balances.debts.filter((debt) => debt.outstandingAmount > 0)
  const cleared = balances.debts.filter((debt) => debt.outstandingAmount === 0)

  return (
    <div className="stack">
      <div className="balance-grid">
        {balances.members.map((member) => (
          <div key={member.memberId} className="balance-card">
            <span className="balance-name">{member.displayName}</span>
            <span
              className={`balance-net ${member.netBalance > 0 ? 'good' : member.netBalance < 0 ? 'bad' : ''}`}
            >
              {formatMoney(member.netBalance, balances.currency)}
            </span>
            <span className="muted small">
              paid {formatMoney(member.totalPaid, balances.currency)} · share{' '}
              {formatMoney(member.totalShare, balances.currency)}
            </span>
            <span className="muted small">
              {member.netBalance > 0
                ? 'is owed'
                : member.netBalance < 0
                  ? 'owes'
                  : 'settled up'}
            </span>
          </div>
        ))}
      </div>

      <div>
        <h3>Who owes whom</h3>
        {outstanding.length === 0 ? (
          <EmptyState title="Everyone is settled up" body="No outstanding debts in this group." />
        ) : (
          <ul className="debt-list">
            {outstanding.map((debt) => (
              <li key={`${debt.fromMemberId}-${debt.toMemberId}`} className="debt">
                <div className="debt-head">
                  <span>
                    <strong>{nameOf(debt.fromMemberId)}</strong> owes{' '}
                    <strong>{nameOf(debt.toMemberId)}</strong>{' '}
                    <strong>{formatMoney(debt.outstandingAmount, balances.currency)}</strong>
                  </span>
                  {canSettle(debt) && (
                    <button type="button" className="link" onClick={() => setSettling(debt)}>
                      Mark as paid
                    </button>
                  )}
                </div>
                <ul className="debt-sources">
                  {debt.edges.map((edge, index) => (
                    <li key={`${edge.expenseId}-${index}`} className="muted small">
                      {edge.expenseDescription} ({formatDate(edge.expenseDate)}) —{' '}
                      {formatMoney(edge.amount, balances.currency)}
                    </li>
                  ))}
                  {debt.settledAmount > 0 && (
                    <li className="muted small">
                      Already marked paid: {formatMoney(debt.settledAmount, balances.currency)}
                    </li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      {cleared.length > 0 && (
        <div>
          <h3>Settled</h3>
          <ul className="debt-list">
            {cleared.map((debt) => (
              <li key={`${debt.fromMemberId}-${debt.toMemberId}`} className="debt settled">
                <span>
                  {nameOf(debt.fromMemberId)} → {nameOf(debt.toMemberId)}{' '}
                  {formatMoney(debt.grossAmount, balances.currency)}
                </span>
                <Badge tone="good">Paid</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {settlements.length > 0 && (
        <p className="muted small">
          {settlements.length} payment{settlements.length === 1 ? '' : 's'} recorded. Marking a debt paid
          never changes the original expense.
        </p>
      )}

      {settling && (
        <MarkPaidDialog
          debt={settling}
          groupId={group.id}
          fromName={nameOf(settling.fromMemberId)}
          toName={nameOf(settling.toMemberId)}
          currency={balances.currency}
          onClose={() => setSettling(null)}
          onDone={() => {
            setSettling(null)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function MarkPaidDialog({
  debt,
  groupId,
  fromName,
  toName,
  currency,
  onClose,
  onDone,
}: {
  debt: PairDebt
  groupId: Id
  fromName: string
  toName: string
  currency: GroupDetail['balances']['currency']
  onClose: () => void
  onDone: () => void
}) {
  const [amountText, setAmountText] = useState(amountToInput(debt.outstandingAmount))
  const markPaid = useMutation((service, amount: number) =>
    service.settlements.markDebtPaid({
      groupId,
      fromMemberId: debt.fromMemberId,
      toMemberId: debt.toMemberId,
      amount,
    }),
  )

  return (
    <Modal title="Mark debt as paid" onClose={onClose}>
      <p>
        Record that <strong>{fromName}</strong> has paid <strong>{toName}</strong>. Evenly does not move
        any money — this just keeps the group up to date.
      </p>
      <label className="field">
        <span className="field-label">Amount ({currency})</span>
        <input value={amountText} onChange={(event) => setAmountText(event.target.value)} inputMode="decimal" />
        <span className="field-hint">
          Outstanding: {formatMoney(debt.outstandingAmount, currency)}
        </span>
      </label>
      <ErrorNotice error={markPaid.error} />
      <div className="form-actions">
        <button type="button" className="ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={markPaid.pending}
          onClick={async () => {
            const amount = parseAmount(amountText) ?? 0
            const result = await markPaid.mutate(amount)
            if (result.ok) onDone()
          }}
        >
          {markPaid.pending ? 'Saving…' : 'Mark as paid'}
        </button>
      </div>
    </Modal>
  )
}
