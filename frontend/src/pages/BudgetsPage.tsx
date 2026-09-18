import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, EmptyState, ErrorNotice, Loading, Modal } from '../components/ui'
import { formatMoney } from '../domain/money'
import { useMutation, useQuery } from '../hooks/useQuery'
import { useSession } from '../state/session-context'

export function BudgetsPage() {
  const { user, loading: sessionLoading } = useSession()
  const [creating, setCreating] = useState(false)
  const { data, loading, error, reload } = useQuery(
    (service) => (user ? service.budgets.list() : Promise.resolve([])),
    [user?.id ?? ''],
  )

  if (sessionLoading || loading) return <Loading label="Loading budgets…" />
  if (!user) {
    return (
      <Card title="Personal budgets">
        <EmptyState
          title="Personal budgets need an account"
          body="Sign in to keep your budgets and payment progress across devices."
          action={<Link to="/profile" className="button primary">Create an account</Link>}
        />
      </Card>
    )
  }

  return (
    <div className="stack">
      <header className="group-header">
        <div>
          <h1>Personal budgets</h1>
          <p className="muted">Track your own expenses and mark them paid as you go.</p>
        </div>
        <button type="button" className="primary" onClick={() => setCreating(true)}>
          Create personal budget
        </button>
      </header>
      <ErrorNotice error={error} onRetry={reload} />
      {(data ?? []).length === 0 ? (
        <Card>
          <EmptyState
            title="No personal budgets yet"
            body="Create a budget for monthly bills, a trip, or any list of expenses."
            action={<button type="button" className="button primary" onClick={() => setCreating(true)}>Create personal budget</button>}
          />
        </Card>
      ) : (
        <ul className="card-grid">
          {(data ?? []).map((budget) => (
            <li key={budget.id}>
              <Link to={`/budgets/${budget.id}`} className="group-card">
                <span className="group-name">{budget.name}</span>
                <span className="muted small">{budget.items.length} expense{budget.items.length === 1 ? '' : 's'}</span>
                <span className="group-total">{formatMoney(budget.remainingAmount, budget.currency)} remaining</span>
                <span className="muted small">{formatMoney(budget.paidAmount, budget.currency)} paid of {formatMoney(budget.totalAmount, budget.currency)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && <CreateBudgetDialog onClose={() => setCreating(false)} />}
    </div>
  )
}

function CreateBudgetDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const create = useMutation((service) => service.budgets.create({ name }))

  return (
    <Modal title="Create a personal budget" onClose={onClose}>
      <form className="stack" onSubmit={async (event) => {
        event.preventDefault()
        const result = await create.mutate()
        if (result.ok) navigate(`/budgets/${result.data.id}`)
      }}>
        <label className="field">
          <span className="field-label">Budget name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="September expenses" autoFocus />
        </label>
        <ErrorNotice error={create.error} />
        <div className="form-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={create.pending || !name.trim()}>
            {create.pending ? 'Creating…' : 'Create budget'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
