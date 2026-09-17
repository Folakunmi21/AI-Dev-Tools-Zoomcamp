import { Link } from 'react-router-dom'
import { ActivityList } from '../components/ActivityList'
import { Card, EmptyState, ErrorNotice, Loading, formatDate } from '../components/ui'
import { formatMoney } from '../domain/money'
import { useQuery } from '../hooks/useQuery'
import type { GroupSummary } from '../services/types'

function GroupRow({ summary }: { summary: GroupSummary }) {
  const { group, memberCount, expenseCount, totalSpent, viewerDebts } = summary
  const to = group.kind === 'quick' ? `/quick/${group.id}` : `/groups/${group.id}`
  return (
    <li className="group-row">
      <Link to={to} className="group-link">
        <span className="group-name">{group.name}</span>
        <span className="muted small">
          {memberCount} {memberCount === 1 ? 'person' : 'people'} · {expenseCount}{' '}
          {expenseCount === 1 ? 'expense' : 'expenses'} · {formatMoney(totalSpent, group.currency)} spent
        </span>
      </Link>
      <span className="group-position">
        {!viewerDebts || (viewerDebts.owes === 0 && viewerDebts.owed === 0) ? (
          <span className="muted small">settled up</span>
        ) : viewerDebts.net >= 0 ? (
          <span className="good">you are owed {formatMoney(viewerDebts.owed - viewerDebts.owes, group.currency)}</span>
        ) : (
          <span className="bad">you owe {formatMoney(viewerDebts.owes - viewerDebts.owed, group.currency)}</span>
        )}
      </span>
    </li>
  )
}

export function DashboardPage() {
  const { data, loading, error, reload } = useQuery((service) => service.dashboard.get(), [])

  if (loading) return <Loading label="Loading your dashboard…" />
  if (error) return <ErrorNotice error={error} onRetry={reload} />
  if (!data) return null

  const { user, groups, quickSplits, totals, recentActivity } = data

  return (
    <div className="stack">
      <section className="hero">
        <div>
          <h1>{user ? `Hi ${user.name.split(' ')[0]}` : 'Split expenses, evenly'}</h1>
          <p className="muted">
            Record a shared expense, and Evenly works out exactly who owes whom. No payments, no
            guesswork.
          </p>
        </div>
        <div className="hero-actions">
          <Link to="/quick-split" className="button primary big">
            Start Quick Split
          </Link>
          <Link to="/groups" className="button ghost big">
            Open a group
          </Link>
        </div>
      </section>

      <div className="grid-2">
        <Card title="Your balance">
          <div className="totals">
            <div>
              <span className="muted small">You owe</span>
              <strong className={totals.owes > 0 ? 'bad' : ''}>{formatMoney(totals.owes)}</strong>
            </div>
            <div>
              <span className="muted small">You are owed</span>
              <strong className={totals.owed > 0 ? 'good' : ''}>{formatMoney(totals.owed)}</strong>
            </div>
            <div>
              <span className="muted small">Net</span>
              <strong className={totals.net > 0 ? 'good' : totals.net < 0 ? 'bad' : ''}>
                {formatMoney(totals.net)}
              </strong>
            </div>
          </div>
          {!user && (
            <p className="muted small">
              Sign in to keep balances across devices. Quick Splits stay in this browser until you do.
            </p>
          )}
        </Card>

        <Card
          title="My groups"
          action={
            <Link to="/groups" className="link">
              Manage
            </Link>
          }
        >
          {groups.length === 0 ? (
            <EmptyState
              title={user ? 'No groups yet' : 'Groups need an account'}
              body={
                user
                  ? 'Create a group for a trip, a flat or a project team.'
                  : 'Create an account to save groups, or use Quick Split without signing up.'
              }
              action={
                <Link to={user ? '/groups' : '/profile'} className="button primary">
                  {user ? 'Create a group' : 'Create an account'}
                </Link>
              }
            />
          ) : (
            <ul className="group-list">
              {groups.map((summary) => (
                <GroupRow key={summary.group.id} summary={summary} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {quickSplits.length > 0 && (
        <Card title="Quick splits">
          <ul className="group-list">
            {quickSplits.map((summary) => (
              <GroupRow key={summary.group.id} summary={summary} />
            ))}
          </ul>
          {!user && (
            <p className="muted small">
              These live in this browser only. Sign in and choose “Save as group” to keep them.
            </p>
          )}
        </Card>
      )}

      <Card title="Recent activity">
        <ActivityList
          activities={recentActivity}
          emptyBody="Expenses, edits and payments will show up here."
        />
        {recentActivity.length > 0 && (
          <p className="muted small">Last updated {formatDate(recentActivity[0].createdAt)}</p>
        )}
      </Card>
    </div>
  )
}
