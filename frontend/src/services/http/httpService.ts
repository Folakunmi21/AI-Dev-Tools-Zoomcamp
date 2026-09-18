import type { Id } from '../../domain/types'
import {
  ServiceError,
  type EvenlyService,
  type ExpenseInput,
  type Session,
  type ServiceErrorCode,
  type UploadedFile,
} from '../types'

export interface HttpServiceOptions {
  /** Base URL of the Evenly API, e.g. `/api`. */
  baseUrl: string
  /** Extra headers (auth token, tracing) merged into every request. */
  headers?: Record<string, string>
  fetchImpl?: typeof fetch
}

interface ApiErrorBody {
  code?: ServiceErrorCode
  message?: string
  detail?: string | Array<{ msg?: string }>
  issues?: ServiceError['issues']
}

/**
 * The real-backend implementation of {@link EvenlyService}.
 *
 * This is the only file in the app that calls `fetch`. Keeping that boundary
 * means the UI remains independent of the transport and API details.
 */
export function createHttpService(options: HttpServiceOptions): EvenlyService {
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const base = options.baseUrl.replace(/\/$/, '')
  const tokenKey = 'evenly.access_token'
  let accessToken: string | null = globalThis.localStorage?.getItem(tokenKey) ?? null

  const setAccessToken = (token: string | null) => {
    accessToken = token
    if (token) globalThis.localStorage?.setItem(tokenKey, token)
    else globalThis.localStorage?.removeItem(tokenKey)
  }

  async function request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
    let response: Response
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        credentials: 'include',
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          ...options.headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ServiceError('conflict', 'Could not reach Evenly. Check your connection.', [])
    }

    if (!response.ok) {
      const parsed = (await response.json().catch(() => ({}))) as ApiErrorBody
      const message = parsed.message ?? (typeof parsed.detail === 'string' ? parsed.detail : parsed.detail?.[0]?.msg)
      const code: ServiceErrorCode =
        parsed.code ??
        (response.status === 404
          ? 'not_found'
          : response.status === 401
            ? 'unauthenticated'
            : response.status === 403
              ? 'forbidden'
              : response.status === 409
                ? 'conflict'
                : 'validation')
      throw new ServiceError(code, message ?? 'Something went wrong.', parsed.issues ?? [])
    }

    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  const get = <T>(path: string) => request<T>('GET', path)
  const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body)
  const patch = <T>(path: string, body?: unknown) => request<T>('PATCH', path, body)
  const del = <T>(path: string) => request<T>('DELETE', path)
  const authenticate = async (path: string, input: unknown): Promise<Session> => {
    const response = await post<Session & { access_token?: string }>(path, input)
    setAccessToken(response.access_token ?? null)
    return { user: response.user }
  }

  const group = (groupId: Id) => `/groups/${encodeURIComponent(groupId)}`

  return {
    auth: {
      getSession: () => get('/auth/session'),
      register: (input) => authenticate('/auth/register', input),
      login: (input) => authenticate('/auth/login', input),
      logout: async () => {
        try {
          await post('/auth/logout')
        } finally {
          setAccessToken(null)
        }
      },
    },
    dashboard: {
      get: () => get('/dashboard'),
    },
    groups: {
      list: () => get('/groups'),
      create: (input) => post('/groups', input),
      get: (groupId) => get(group(groupId)),
      update: (groupId, input) => patch(group(groupId), input),
      createQuickSplit: (input) => post('/quick-splits', input),
      saveQuickSplit: (groupId) => post(`${group(groupId)}/save`),
      addMember: (groupId, displayName) => post(`${group(groupId)}/members`, { displayName }),
      removeMember: (groupId, memberId) =>
        del(`${group(groupId)}/members/${encodeURIComponent(memberId)}`),
      createInviteLink: (groupId) => post(`${group(groupId)}/invite`),
      revokeInviteLink: (groupId) => del(`${group(groupId)}/invite`),
      previewInvite: (token) => get(`/invites/${encodeURIComponent(token)}`),
      acceptInvite: (token, displayName) =>
        post(`/invites/${encodeURIComponent(token)}/accept`, { displayName }),
      inviteUserByEmail: (groupId, email) => post(`${group(groupId)}/invitations`, { email }),
    },
    expenses: {
      create: (input) => post('/expenses', input),
      update: (expenseId, input: Omit<ExpenseInput, 'groupId'>) =>
        patch(`/expenses/${encodeURIComponent(expenseId)}`, input),
      remove: (expenseId) => del(`/expenses/${encodeURIComponent(expenseId)}`),
      get: (expenseId) => get(`/expenses/${encodeURIComponent(expenseId)}`),
    },
    settlements: {
      markDebtPaid: (input) => post('/settlements', input),
    },
    notifications: {
      list: () => get('/notifications'),
      unreadCount: () => get<{ count: number }>('/notifications/unread-count').then((r) => r.count),
      markRead: (notificationId) =>
        post(`/notifications/${encodeURIComponent(notificationId)}/read`),
      markAllRead: () => post('/notifications/read-all'),
    },
    uploads: {
      uploadReceipt: async (file: File): Promise<UploadedFile> => {
        const form = new FormData()
        form.append('file', file)
        const response = await doFetch(`${base}/uploads/receipts`, {
          method: 'POST',
          credentials: 'include',
          headers: { ...options.headers },
          body: form,
        })
        if (!response.ok) throw new ServiceError('validation', 'That receipt could not be uploaded.')
        return (await response.json()) as UploadedFile
      },
    },
  }
}
