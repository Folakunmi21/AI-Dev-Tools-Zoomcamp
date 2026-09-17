import { Link } from 'react-router-dom'
import { Card, EmptyState, ErrorNotice, Loading, formatDateTime } from '../components/ui'
import { useMutation, useQuery } from '../hooks/useQuery'
import { useSession } from '../state/session-context'

export function NotificationsPage() {
  const { user, loading: sessionLoading } = useSession()
  const { data, loading, error, reload } = useQuery(
    (service) => (user ? service.notifications.list() : Promise.resolve([])),
    [user?.id ?? ''],
  )

  const markRead = useMutation((service, id: string) => service.notifications.markRead(id))
  const markAllRead = useMutation((service) => service.notifications.markAllRead())

  if (sessionLoading || loading) return <Loading label="Loading notifications…" />

  if (!user) {
    return (
      <Card title="Notifications">
        <EmptyState
          title="Notifications need an account"
          body="In-app notifications tell you when someone adds an expense or marks a debt paid."
          action={
            <Link to="/profile" className="button primary">
              Sign in
            </Link>
          }
        />
      </Card>
    )
  }

  const notifications = data ?? []
  const unread = notifications.filter((notification) => !notification.readAt).length

  return (
    <div className="stack">
      <header className="group-header">
        <div>
          <h1>Notifications</h1>
          <p className="muted">
            {unread > 0 ? `${unread} unread` : 'All caught up'} · in-app only in the MVP
          </p>
        </div>
        {unread > 0 && (
          <div className="header-actions">
            <button
              type="button"
              className="ghost"
              disabled={markAllRead.pending}
              onClick={() => markAllRead.mutate()}
            >
              Mark all as read
            </button>
          </div>
        )}
      </header>

      <ErrorNotice error={error ?? markRead.error ?? markAllRead.error} onRetry={reload} />

      <Card>
        {notifications.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            body="You will hear about new expenses, edits, deletions, payments and invitations."
          />
        ) : (
          <ul className="notification-list">
            {notifications.map((notification) => (
              <li key={notification.id} className={notification.readAt ? 'notification' : 'notification unread'}>
                <div>
                  <strong>{notification.title}</strong>
                  <p>{notification.message}</p>
                  <span className="muted small">{formatDateTime(notification.createdAt)}</span>
                </div>
                <div className="inline-actions">
                  {notification.groupId && (
                    <Link to={`/groups/${notification.groupId}`} className="link">
                      Open group
                    </Link>
                  )}
                  {!notification.readAt && (
                    <button
                      type="button"
                      className="link"
                      disabled={markRead.pending}
                      onClick={() => markRead.mutate(notification.id)}
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
