import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { EvenlyService } from '../services/types'

interface ServiceContextValue {
  service: EvenlyService
  /** Bumped after every mutation; queries depend on it and refetch. */
  revision: number
  refresh: () => void
}

const ServiceContext = createContext<ServiceContextValue | null>(null)

/**
 * Makes one `EvenlyService` available to the whole tree.
 *
 * Components never construct a service: tests pass a mock built with their own
 * storage, and `main.tsx` passes whatever `createService()` selected.
 */
export function ServiceProvider({
  service,
  children,
}: {
  service: EvenlyService
  children: ReactNode
}) {
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((current) => current + 1), [])
  const value = useMemo<ServiceContextValue>(
    () => ({ service, revision, refresh }),
    [service, revision, refresh],
  )
  return <ServiceContext.Provider value={value}>{children}</ServiceContext.Provider>
}

function useServiceContext(): ServiceContextValue {
  const context = useContext(ServiceContext)
  if (!context) throw new Error('useService must be used inside a <ServiceProvider>.')
  return context
}

export const useService = (): EvenlyService => useServiceContext().service

export const useDataRevision = (): number => useServiceContext().revision

/** Invalidate every query in the app — call after a successful mutation. */
export const useRefreshData = (): (() => void) => useServiceContext().refresh
