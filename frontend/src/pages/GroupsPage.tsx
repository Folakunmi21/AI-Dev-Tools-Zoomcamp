import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, EmptyState, ErrorNotice, Loading, Modal } from '../components/ui'
import { formatMoney } from '../domain/money'
import { useMutation, useQuery } from '../hooks/useQuery'
import { useSession } from '../state/session-context'

export function GroupsPage() {
  const { user, loading: sessionLoading } = useSession()
  const [creating, setCreating] = useState(false)
  const { data, loading, error, reload } = useQuery(
    (service) => (user ? service.groups.list() : Promise.resolve([])),
    [user?.id ?? ''],
  )

  if (sessionLoading || loading) return <Loading label="Loading groups…" />

  if (!user) {
    return (
      <Card title="Groups">
        <EmptyState
          title="Saved groups need an account"
          body="Create an account to keep groups, invite people and sync across devices. Quick Split works without one."
          action={
            <span className="inline-actions">
              <Link to="/profile" className="button primary">
                Create an account
              </Link>
              <Link to="/quick-split" className="button ghost">
                Use Quick Split
              </Link>
            </span>
          }
        />
      </Card>
    )
  }

  return (
    <div className="stack">
      <header className="group-header">
        <div>
          <h1>My groups</h1>
          <p className="muted">Trips, flats, dinners, project teams — anything with shared costs.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="primary" onClick={() => setCreating(true)}>
            Create group
          </button>
          <Link to="/budgets" className="button ghost">
            Personal budgets
          </Link>
        </div>
      </header>

      <ErrorNotice error={error} onRetry={reload} />

      {(data ?? []).length === 0 ? (
        <Card>
          <EmptyState
            title="No groups yet"
            body="Create your first group and add the people sharing the costs."
            action={
              <button type="button" className="button primary" onClick={() => setCreating(true)}>
                Create group
              </button>
            }
          />
        </Card>
      ) : (
        <ul className="card-grid">
          {(data ?? []).map((summary) => (
            <li key={summary.group.id}>
              <Link to={`/groups/${summary.group.id}`} className="group-card">
                <span className="group-name">{summary.group.name}</span>
                {summary.group.description && (
                  <span className="muted small">{summary.group.description}</span>
                )}
                <span className="muted small">
                  {summary.memberCount} members · {summary.expenseCount} expenses
                </span>
                <span className="group-total">
                  {formatMoney(summary.totalSpent, summary.group.currency)}
                </span>
                {summary.viewerDebts && summary.viewerDebts.net !== 0 && (
                  <span className={summary.viewerDebts.net > 0 ? 'good small' : 'bad small'}>
                    {summary.viewerDebts.net > 0
                      ? `you are owed ${formatMoney(summary.viewerDebts.net, summary.group.currency)}`
                      : `you owe ${formatMoney(-summary.viewerDebts.net, summary.group.currency)}`}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {creating && <CreateGroupDialog onClose={() => setCreating(false)} />}
    </div>
  )
}

function CreateGroupDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [memberNames, setMemberNames] = useState('')

  const createGroup = useMutation((service) =>
    service.groups.create({
      name,
      description,
      memberNames: memberNames
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    }),
  )

  return (
    <Modal title="Create a group" onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault()
          const result = await createGroup.mutate()
          if (result.ok) navigate(`/groups/${result.data.id}`)
        }}
      >
        <label className="field">
          <span className="field-label">Group name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Lagos Trip"
            autoFocus
          />
        </label>
        <label className="field">
          <span className="field-label">Description (optional)</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Four days in Lagos"
          />
        </label>
        <label className="field">
          <span className="field-label">Add people by name (optional)</span>
          <input
            value={memberNames}
            onChange={(event) => setMemberNames(event.target.value)}
            placeholder="Kunmi, Tobi, Zainab"
          />
          <span className="field-hint">
            Separate names with commas. You can also invite people with a link later.
          </span>
        </label>
        <ErrorNotice error={createGroup.error} />
        <div className="form-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={createGroup.pending || !name.trim()}>
            {createGroup.pending ? 'Creating…' : 'Create group'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
