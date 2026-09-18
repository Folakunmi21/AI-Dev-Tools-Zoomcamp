import { Link, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { EmptyState } from './components/ui'
import { DashboardPage } from './pages/DashboardPage'
import { BudgetPage } from './pages/BudgetPage'
import { BudgetsPage } from './pages/BudgetsPage'
import { GroupPage } from './pages/GroupPage'
import { GroupsPage } from './pages/GroupsPage'
import { JoinPage } from './pages/JoinPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { ProfilePage } from './pages/ProfilePage'
import { QuickSplitPage } from './pages/QuickSplitPage'
import { SessionProvider } from './state/session-context'

function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      body="That link does not go anywhere in Evenly."
      action={
        <Link to="/" className="button primary">
          Back to dashboard
        </Link>
      }
    />
  )
}

export function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="quick-split" element={<QuickSplitPage />} />
          {/* Quick splits and saved groups are the same screen. */}
          <Route path="quick/:groupId" element={<GroupPage />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="groups/:groupId" element={<GroupPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="budgets/:budgetId" element={<BudgetPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="join/:token" element={<JoinPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </SessionProvider>
  )
}
