import { NavLink, Outlet } from 'react-router-dom'
import { useQuery } from '../hooks/useQuery'
import { useSession } from '../state/session-context'

function UnreadBadge() {
  const { user } = useSession()
  const { data } = useQuery(
    (service) => (user ? service.notifications.unreadCount() : Promise.resolve(0)),
    [user?.id ?? ''],
  )
  if (!data) return null
  return <span className="nav-badge">{data}</span>
}

export function Layout() {
  const { user, isGuest } = useSession()

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark">₦</span>
          <span>Evenly</span>
        </NavLink>

        <nav className="nav">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/groups">Groups</NavLink>
          <NavLink to="/budgets">Budgets</NavLink>
          {user && (
            <NavLink to="/notifications" className="nav-with-badge">
              Notifications
              <UnreadBadge />
            </NavLink>
          )}
          <NavLink to="/profile">{user ? 'Profile' : 'Sign in'}</NavLink>
        </nav>
      </header>

      {isGuest && (
        <div className="guest-strip">
          You are using Evenly as a guest — Quick Split works without an account.{' '}
          <NavLink to="/profile">Create an account</NavLink> to save groups.
        </div>
      )}

      <main className="content">
        <Outlet />
      </main>

      <footer className="footer">
        <span>Evenly — MVP. Payments happen outside the app.</span>
        <span className="muted">
          Connected to the Evenly API
        </span>
      </footer>
    </div>
  )
}
