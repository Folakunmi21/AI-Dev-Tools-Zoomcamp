import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, ErrorNotice } from '../components/ui'
import { useMutation } from '../hooks/useQuery'
import { useSession } from '../state/session-context'

function PasswordIcon({ hidden }: { hidden: boolean }) {
  return hidden ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A11.2 11.2 0 0112 5c5.2 0 8.8 4.2 9.8 6.5a11.8 11.8 0 01-3.1 4.2M6.2 6.2A12.1 12.1 0 002.2 11.5C3.2 13.8 6.8 18 12 18c1 0 1.9-.2 2.8-.5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2.2 12S5.8 5.5 12 5.5 21.8 12 21.8 12 18.2 18.5 12 18.5 2.2 12 2.2 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  )
}

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
  const [showPassword, setShowPassword] = useState(false)

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
            <span className="password-input">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                className="icon-button password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                <PasswordIcon hidden={showPassword} />
              </button>
            </span>
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

    </div>
  )
}
