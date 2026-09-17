import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useQuery } from '../hooks/useQuery'
import type { User } from '../domain/types'

interface SessionContextValue {
  user: User | null
  loading: boolean
  isGuest: boolean
}

const SessionContext = createContext<SessionContextValue | null>(null)

/**
 * Holds the signed-in user, if any. Accounts are optional in Evenly, so a null
 * user is a supported state rather than an error: guests can still Quick Split.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { data, loading } = useQuery((service) => service.auth.getSession(), [])
  const value = useMemo<SessionContextValue>(
    () => ({ user: data?.user ?? null, loading, isGuest: !loading && !data?.user }),
    [data, loading],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside a <SessionProvider>.')
  return context
}
