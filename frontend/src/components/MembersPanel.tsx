import { useState } from 'react'
import { useMutation } from '../hooks/useQuery'
import type { GroupDetail } from '../services/types'
import { Badge, ErrorNotice, formatDate } from './ui'

const inviteUrl = (token: string) => `${window.location.origin}/join/${token}`

export function MembersPanel({ detail, onChanged }: { detail: GroupDetail; onChanged: () => void }) {
  const { group, members, viewer } = detail
  const [newName, setNewName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [copied, setCopied] = useState(false)

  const addMember = useMutation(
    (service, displayName: string) => service.groups.addMember(group.id, displayName),
    { onSuccess: onChanged },
  )
  const removeMember = useMutation(
    (service, memberId: string) => service.groups.removeMember(group.id, memberId),
    { onSuccess: onChanged },
  )
  const createInvite = useMutation((service) => service.groups.createInviteLink(group.id), {
    onSuccess: onChanged,
  })
  const revokeInvite = useMutation((service) => service.groups.revokeInviteLink(group.id), {
    onSuccess: onChanged,
  })
  const inviteByEmail = useMutation(
    (service, email: string) => service.groups.inviteUserByEmail(group.id, email),
    { onSuccess: onChanged },
  )

  return (
    <div className="stack">
      <ul className="member-list">
        {members.map((member) => (
          <li key={member.id} className="member">
            <span>
              <strong>{member.displayName}</strong>
              {member.role === 'admin' && <Badge tone="info">Admin</Badge>}
              {!member.userId && <Badge>No account</Badge>}
              {member.id === viewer.memberId && <Badge tone="good">You</Badge>}
            </span>
            <span className="muted small">joined {formatDate(member.joinedAt)}</span>
            {viewer.canManageMembers && member.role !== 'admin' && (
              <button
                type="button"
                className="link danger"
                disabled={removeMember.pending}
                onClick={() => removeMember.mutate(member.id)}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <ErrorNotice error={removeMember.error} />

      {viewer.canManageMembers && (
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault()
            const result = await addMember.mutate(newName)
            if (result.ok) setNewName('')
          }}
        >
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Add someone by name"
            aria-label="New member name"
          />
          <button type="submit" className="primary" disabled={addMember.pending || !newName.trim()}>
            Add
          </button>
        </form>
      )}
      <ErrorNotice error={addMember.error} />

      {viewer.canManageInvite && (
        <div className="stack">
          <h3>Invite link</h3>
          {group.inviteToken ? (
            <>
              <div className="inline-form">
                <input readOnly value={inviteUrl(group.inviteToken)} aria-label="Invite link" />
                <button
                  type="button"
                  className="ghost"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(inviteUrl(group.inviteToken!)).catch(() => {})
                    setCopied(true)
                  }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="inline-actions">
                <button
                  type="button"
                  className="link"
                  disabled={createInvite.pending}
                  onClick={() => {
                    setCopied(false)
                    createInvite.mutate()
                  }}
                >
                  Generate a new link
                </button>
                <button
                  type="button"
                  className="link danger"
                  disabled={revokeInvite.pending}
                  onClick={() => revokeInvite.mutate()}
                >
                  Revoke link
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={createInvite.pending}
              onClick={() => createInvite.mutate()}
            >
              Create invite link
            </button>
          )}
          <ErrorNotice error={createInvite.error ?? revokeInvite.error} />

          <h3>Invite an Evenly account</h3>
          <form
            className="inline-form"
            onSubmit={async (event) => {
              event.preventDefault()
              const result = await inviteByEmail.mutate(inviteEmail)
              if (result.ok) setInviteEmail('')
            }}
          >
            <input
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="name@example.com"
              aria-label="Invite by email"
              type="email"
            />
            <button type="submit" className="ghost" disabled={inviteByEmail.pending || !inviteEmail.trim()}>
              Send invitation
            </button>
          </form>
          <p className="muted small">
            MVP notifications are in-app only, so the person needs an Evenly account to receive this.
          </p>
          <ErrorNotice error={inviteByEmail.error} />
        </div>
      )}
    </div>
  )
}
