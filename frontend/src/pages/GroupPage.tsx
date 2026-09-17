import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ActivityList } from '../components/ActivityList'
import { BalancesPanel } from '../components/BalancesPanel'
import { ExpenseForm } from '../components/ExpenseForm'
import { ExpenseList } from '../components/ExpenseList'
import { MembersPanel } from '../components/MembersPanel'
import { Card, ErrorNotice, Loading, Modal, formatDate } from '../components/ui'
import { summarizeMemberDebts } from '../domain/balances'
import { formatMoney, sum } from '../domain/money'
import { useMutation, useQuery } from '../hooks/useQuery'
import type { GroupDetail } from '../services/types'
import { useSession } from '../state/session-context'

const TABS = ['Overview', 'Expenses', 'Balances', 'Activity', 'Members'] as const
type Tab = (typeof TABS)[number]

export function GroupPage() {
  const { groupId = '' } = useParams()
  const { user } = useSession()
  const [tab, setTab] = useState<Tab>('Overview')
  const [addingExpense, setAddingExpense] = useState(false)
  const [editingGroup, setEditingGroup] = useState(false)

  const { data, loading, error, reload } = useQuery(
    (service) => service.groups.get(groupId),
    [groupId],
  )

  const saveQuickSplit = useMutation((service) => service.groups.saveQuickSplit(groupId))

  if (loading) return <Loading label="Loading group…" />
  if (error) {
    return (
      <div className="stack">
        <ErrorNotice error={error} onRetry={reload} />
        <Link to="/" className="link">
          Back to dashboard
        </Link>
      </div>
    )
  }
  if (!data) return null

  const detail: GroupDetail = data
  const { group, members, expenses, balances, activities, viewer } = detail
  const isQuick = group.kind === 'quick'
  const viewerDebts = viewer.memberId ? summarizeMemberDebts(balances, viewer.memberId) : null
  const totalSpent = sum(expenses.map((expense) => expense.totalAmount))

  return (
    <div className="stack">
      <header className="group-header">
        <div>
          <p className="muted small">
            {isQuick ? 'Quick Split' : 'Group'} · {members.length}{' '}
            {members.length === 1 ? 'member' : 'members'}
            {viewer.isAdmin && !isQuick ? ' · you are the admin' : ''}
          </p>
          <h1>{group.name}</h1>
          {group.description && <p className="muted">{group.description}</p>}
        </div>

        <div className="header-actions">
          <button type="button" className="primary" onClick={() => setAddingExpense(true)}>
            Add expense
          </button>
          {!isQuick && viewer.canManageInvite && (
            <button type="button" className="ghost" onClick={() => setTab('Members')}>
              Invite member
            </button>
          )}
          {viewer.canEditGroup && !isQuick && (
            <button type="button" className="ghost" onClick={() => setEditingGroup(true)}>
              Edit details
            </button>
          )}
        </div>
      </header>

      {isQuick && (
        <div className="notice info">
          {user ? (
            <>
              <span>Keep this split and its history by saving it as a group.</span>
              <button
                type="button"
                className="link"
                disabled={saveQuickSplit.pending}
                onClick={async () => {
                  const result = await saveQuickSplit.mutate()
                  if (result.ok) reload()
                }}
              >
                Save as group
              </button>
            </>
          ) : (
            <>
              <span>This quick split lives in this browser only.</span>
              <Link to="/profile" className="link">
                Create an account to save it
              </Link>
            </>
          )}
        </div>
      )}
      <ErrorNotice error={saveQuickSplit.error} />

      <nav className="tabs" role="tablist">
        {TABS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={tab === candidate}
            className={tab === candidate ? 'tab active' : 'tab'}
            onClick={() => setTab(candidate)}
          >
            {candidate}
          </button>
        ))}
      </nav>

      {tab === 'Overview' && (
        <div className="grid-2">
          <Card title="This group">
            <div className="totals">
              <div>
                <span className="muted small">Total spent</span>
                <strong>{formatMoney(totalSpent, group.currency)}</strong>
              </div>
              <div>
                <span className="muted small">Expenses</span>
                <strong>{expenses.length}</strong>
              </div>
              <div>
                <span className="muted small">Created</span>
                <strong>{formatDate(group.createdAt)}</strong>
              </div>
            </div>
            {viewerDebts && (
              <p className="muted small">
                You owe {formatMoney(viewerDebts.owes, group.currency)} · you are owed{' '}
                {formatMoney(viewerDebts.owed, group.currency)}
              </p>
            )}
          </Card>

          <Card
            title="Who owes whom"
            action={
              <button type="button" className="link" onClick={() => setTab('Balances')}>
                See all
              </button>
            }
          >
            {balances.debts.filter((debt) => debt.outstandingAmount > 0).length === 0 ? (
              <p className="muted">Everyone is settled up.</p>
            ) : (
              <ul className="plain">
                {balances.debts
                  .filter((debt) => debt.outstandingAmount > 0)
                  .slice(0, 5)
                  .map((debt) => {
                    const nameOf = (id: string) =>
                      members.find((member) => member.id === id)?.displayName ?? 'Someone'
                    return (
                      <li key={`${debt.fromMemberId}-${debt.toMemberId}`}>
                        <strong>{nameOf(debt.fromMemberId)}</strong> owes{' '}
                        <strong>{nameOf(debt.toMemberId)}</strong>{' '}
                        {formatMoney(debt.outstandingAmount, group.currency)}
                      </li>
                    )
                  })}
              </ul>
            )}
          </Card>

          <Card className="span-2" title="Recent expenses">
            <ExpenseList detail={{ ...detail, expenses: expenses.slice(0, 5) }} onChanged={reload} />
          </Card>
        </div>
      )}

      {tab === 'Expenses' && (
        <Card title={`${expenses.length} ${expenses.length === 1 ? 'expense' : 'expenses'}`}>
          <ExpenseList detail={detail} onChanged={reload} />
        </Card>
      )}

      {tab === 'Balances' && (
        <Card title="Balances">
          <BalancesPanel detail={detail} onChanged={reload} />
        </Card>
      )}

      {tab === 'Activity' && (
        <Card title="Activity">
          <ActivityList
            activities={activities}
            emptyBody="Expenses, edits, deletions and payments are recorded here."
          />
        </Card>
      )}

      {tab === 'Members' && (
        <Card title="Members">
          <MembersPanel detail={detail} onChanged={reload} />
        </Card>
      )}

      {addingExpense && (
        <Modal title="Add expense" wide onClose={() => setAddingExpense(false)}>
          <ExpenseForm
            group={group}
            members={members}
            defaultPayerId={viewer.memberId}
            onSaved={() => {
              setAddingExpense(false)
              reload()
            }}
            onCancel={() => setAddingExpense(false)}
          />
        </Modal>
      )}

      {editingGroup && (
        <EditGroupDialog detail={detail} onClose={() => setEditingGroup(false)} onSaved={reload} />
      )}
    </div>
  )
}

function EditGroupDialog({
  detail,
  onClose,
  onSaved,
}: {
  detail: GroupDetail
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(detail.group.name)
  const [description, setDescription] = useState(detail.group.description)
  const update = useMutation((service) =>
    service.groups.update(detail.group.id, { name, description }),
  )

  return (
    <Modal title="Edit group details" onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault()
          const result = await update.mutate()
          if (result.ok) {
            onSaved()
            onClose()
          }
        }}
      >
        <label className="field">
          <span className="field-label">Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Description</span>
          <textarea
            value={description}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <ErrorNotice error={update.error} />
        <div className="form-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={update.pending}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}
