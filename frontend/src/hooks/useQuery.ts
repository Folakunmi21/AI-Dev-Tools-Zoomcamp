import { useCallback, useEffect, useRef, useState } from 'react'
import type { EvenlyService } from '../services/types'
import { useDataRevision, useRefreshData, useService } from '../state/service-context'

export interface QueryResult<T> {
  data: T | null
  error: Error | null
  loading: boolean
  reload: () => void
}

/**
 * Read data through the service layer.
 *
 * Deliberately small: one in-flight request per hook, cancelled on unmount or
 * when `deps` change, and refetched whenever any mutation bumps the revision.
 */
export function useQuery<T>(
  loader: (service: EvenlyService) => Promise<T>,
  deps: readonly unknown[] = [],
): QueryResult<T> {
  const service = useService()
  const revision = useDataRevision()
  const [localRevision, setLocalRevision] = useState(0)
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)

  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    loaderRef.current(service).then(
      (result) => {
        if (cancelled) return
        setData(result)
        setLoading(false)
      },
      (cause: unknown) => {
        if (cancelled) return
        setData(null)
        setError(cause instanceof Error ? cause : new Error(String(cause)))
        setLoading(false)
      },
    )

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, revision, localRevision, ...deps])

  const reload = useCallback(() => setLocalRevision((current) => current + 1), [])

  return { data, error, loading, reload }
}

/**
 * Outcome of a mutation. Modelled as a result rather than a thrown error so
 * callers can branch on success even when the call itself returns `void`.
 */
export type MutationOutcome<TResult> =
  | { ok: true; data: TResult }
  | { ok: false; error: Error }

export interface MutationResult<TArgs extends unknown[], TResult> {
  mutate: (...args: TArgs) => Promise<MutationOutcome<TResult>>
  pending: boolean
  error: Error | null
  reset: () => void
}

export interface MutationOptions<TResult> {
  onSuccess?: (result: TResult) => void
  /** Invalidate every query afterwards. On by default. */
  refresh?: boolean
}

/**
 * Write data through the service layer, with the error kept on the hook so
 * screens can show it inline instead of throwing.
 */
export function useMutation<TArgs extends unknown[], TResult>(
  run: (service: EvenlyService, ...args: TArgs) => Promise<TResult>,
  options: MutationOptions<TResult> = {},
): MutationResult<TArgs, TResult> {
  const service = useService()
  const refreshData = useRefreshData()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const runRef = useRef(run)
  runRef.current = run
  const optionsRef = useRef(options)
  optionsRef.current = options

  const mutate = useCallback(
    async (...args: TArgs): Promise<MutationOutcome<TResult>> => {
      setPending(true)
      setError(null)
      try {
        const data = await runRef.current(service, ...args)
        optionsRef.current.onSuccess?.(data)
        if (optionsRef.current.refresh !== false) refreshData()
        return { ok: true, data }
      } catch (cause) {
        const failure = cause instanceof Error ? cause : new Error(String(cause))
        setError(failure)
        return { ok: false, error: failure }
      } finally {
        setPending(false)
      }
    },
    [service, refreshData],
  )

  const reset = useCallback(() => setError(null), [])

  return { mutate, pending, error, reset }
}
