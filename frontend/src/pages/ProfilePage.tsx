import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, ErrorNotice } from '../components/ui'
import { useMutation } from '../hooks/useQuery'
import { DEMO_CREDENTIALS } from '../services'
import { useSession } from '../state/session-context'

/**
 * Account screen. Accounts are optional in Evenly, so this doubles as the
 * sign-in / sign-up screen for guests.
 */
export function ProfilePage() {
  const { user, loading } = useSession()
  if (loading) return null
  return user ? <AccountPanel /> : <AuthPanel />
}

function AccountPanel() {
  const { user } = useSession()
  const navigate = useNavigate()
  const logout = useMutation((service) => service.auth.logout())

  return (
    <div className="narrow stack">
      <h1>Profile</h1>
      <Card title="Account">
        <dl className="detail-list">
          <dt>Name</dt>
          <dd>{user?.name}</dd>
          <dt>Email</dt>
          <dd>{user?.email}</dd>
          <dt>Currency</dt>
          <dd>Nigerian Naira (₦)</dd>
        </dl>
        <p className="muted small">
          The MVP supports Naira only. Currency is stored per group, so more can be added later.
        </p>
      </Card>

      <Card title="Preferences">
        <p className="muted">
          Notification preferences and multi-currency support are planned after the MVP. For now every
          group action sends an in-app notification.
        </p>
      </Card>

      <Card title="Session">
        <ErrorNotice error={logout.error} />
        <button
          type="button"
          className="ghost"
          disabled={logout.pending}
          onClick={async () => {
            const result = await logout.mutate()
            if (result.ok) navigate('/')
          }}
        >
          Sign out
        </button>
      </Card>
    </div>
  )
}

function AuthPanel() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation((service) => service.auth.login({ email, password }))
  const register = useMutation((service) => service.auth.register({ name, email, password }))
  const active = mode === 'login' ? login : register

  return (
    <div className="narrow stack">
      <div>
        <h1>{mode === 'login' ? 'Sign in' : 'Create an account'}</h1>
        <p className="muted">
          Accounts are optional — they let you save groups, invite people and get notifications.
        </p>
      </div>

      <Card>
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault()
            const result = await active.mutate()
            if (result.ok) navigate('/')
          }}
        >
          {mode === 'register' && (
            <label className="field">
              <span className="field-label">Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
            </label>
          )}
          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {mode === 'register' && <span className="field-hint">At least 8 characters.</span>}
          </label>

          <ErrorNotice error={active.error} />

          <div className="form-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? 'Create an account' : 'I already have an account'}
            </button>
            <button type="submit" className="primary" disabled={active.pending}>
              {active.pending ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </div>
        </form>
      </Card>

      {mode === 'login' && (
        <Card title="Demo account">
          <p className="muted small">
            The mock backend ships with sample groups. Sign in as{' '}
            <code>{DEMO_CREDENTIALS.email}</code> / <code>{DEMO_CREDENTIALS.password}</code>.
          </p>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setEmail(DEMO_CREDENTIALS.email)
              setPassword(DEMO_CREDENTIALS.password)
            }}
          >
            Fill demo credentials
          </button>
        </Card>
      )}
    </div>
  )
}
