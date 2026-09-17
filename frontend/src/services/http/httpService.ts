import type { Id } from '../../domain/types'
import {
  ServiceError,
  type EvenlyService,
  type ExpenseInput,
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
  issues?: ServiceError['issues']
}

/**
 * The real-backend implementation of {@link EvenlyService}.
 *
 * There is no Evenly server yet — the MVP runs on `createMockService()`. This
 * adapter exists to keep the seam honest: it is the only file in the app that is
 * allowed to call `fetch`, and it shows that swapping in a server is a matter of
 * implementing one interface rather than touching the UI.
 */
export function createHttpService(options: HttpServiceOptions): EvenlyService {
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const base = options.baseUrl.replace(/\/$/, '')

  async function request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
    let response: Response
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        credentials: 'include',
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...options.headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ServiceError('conflict', 'Could not reach Evenly. Check your connection.', [])
    }

    if (!response.ok) {
      const parsed = (await response.json().catch(() => ({}))) as ApiErrorBody
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
      throw new ServiceError(code, parsed.message ?? 'Something went wrong.', parsed.issues ?? [])
    }

    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  const get = <T>(path: string) => request<T>('GET', path)
  const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body)
  const patch = <T>(path: string, body?: unknown) => request<T>('PATCH', path, body)
  const del = <T>(path: string) => request<T>('DELETE', path)

  const group = (groupId: Id) => `/groups/${encodeURIComponent(groupId)}`

  return {
    auth: {
      getSession: () => get('/auth/session'),
      register: (input) => post('/auth/register', input),
      login: (input) => post('/auth/login', input),
      logout: () => post('/auth/logout'),
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
