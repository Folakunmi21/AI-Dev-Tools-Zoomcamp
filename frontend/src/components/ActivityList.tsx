import type { Activity } from '../domain/types'
import { EmptyState, formatDateTime } from './ui'

const ICONS: Record<Activity['action'], string> = {
  expense_created: '＋',
  expense_edited: '✎',
  expense_deleted: '🗑',
  member_joined: '👋',
  member_added: '👤',
  member_removed: '✖',
  group_created: '★',
  group_updated: '✎',
  debt_marked_paid: '✓',
  invite_link_created: '🔗',
  invite_link_revoked: '🔗',
}

/** The audit trail. Deleted expenses stay here on purpose. */
export function ActivityList({
  activities,
  emptyBody,
}: {
  activities: Activity[]
  emptyBody?: string
}) {
  if (activities.length === 0) {
    return <EmptyState title="Nothing here yet" body={emptyBody} />
  }

  return (
    <ul className="activity-list">
      {activities.map((activity) => (
        <li key={activity.id} className={`activity ${activity.action}`}>
          <span className="activity-icon" aria-hidden="true">
            {ICONS[activity.action]}
          </span>
          <span className="activity-body">
            <span>{activity.summary}</span>
            <span className="muted small">{formatDateTime(activity.createdAt)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
