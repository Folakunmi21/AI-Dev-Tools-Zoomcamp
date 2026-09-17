import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card, EmptyState, ErrorNotice, Loading } from '../components/ui'
import { useMutation, useQuery } from '../hooks/useQuery'
import { useSession } from '../state/session-context'

/** Landing page for an invite link: /join/:token */
export function JoinPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { user, loading: sessionLoading } = useSession()
  const [displayName, setDisplayName] = useState('')

  const { data, loading, error } = useQuery(
    (service) => service.groups.previewInvite(token),
    [token],
  )
  const accept = useMutation((service) => service.groups.acceptInvite(token, displayName))

  if (loading || sessionLoading) return <Loading label="Checking invitation…" />

  if (error || !data?.valid) {
    return (
      <Card title="Invitation">
        <EmptyState
          title="That invite link is not valid"
          body="It may have been revoked. Ask the group admin for a new link."
          action={
            <Link to="/" className="button ghost">
              Back to dashboard
            </Link>
          }
        />
      </Card>
    )
  }

  return (
    <div className="narrow stack">
      <div>
        <h1>Join {data.groupName}</h1>
        <p className="muted">
          {data.memberCount} {data.memberCount === 1 ? 'person is' : 'people are'} already in this group.
        </p>
      </div>

      <Card>
        {user ? (
          <form
            className="stack"
            onSubmit={async (event) => {
              event.preventDefault()
              const result = await accept.mutate()
              if (result.ok) navigate(`/groups/${data.groupId}`)
            }}
          >
            <label className="field">
              <span className="field-label">Display name in this group</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={user.name.split(' ')[0]}
              />
              <span className="field-hint">Leave blank to use {user.name.split(' ')[0]}.</span>
            </label>
            <ErrorNotice error={accept.error} />
            <div className="form-actions">
              <button type="submit" className="primary" disabled={accept.pending}>
                {accept.pending ? 'Joining…' : 'Join group'}
              </button>
            </div>
          </form>
        ) : (
          <EmptyState
            title="Sign in to join"
            body="Joining a group needs an account so your balances follow you. Quick Split does not."
            action={
              <Link to="/profile" className="button primary">
                Sign in or create an account
              </Link>
            }
          />
        )}
      </Card>
    </div>
  )
}
