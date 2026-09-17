import { createHttpService } from './http/httpService'
import { createMockService } from './mock/mockService'
import type { EvenlyService } from './types'

export * from './types'
export { createMockService } from './mock/mockService'
export { createHttpService } from './http/httpService'
export { DEMO_CREDENTIALS } from './mock/seed'

/**
 * Pick the implementation the app runs against.
 *
 * Defaults to the mock backend, which is what makes `npm run dev` work with no
 * server. Set `VITE_API_BASE_URL` to point the same UI at a real API.
 */
export function createService(): EvenlyService {
  const baseUrl = import.meta.env?.VITE_API_BASE_URL

  if (baseUrl) {
    return createHttpService({ baseUrl })
  }

  return createMockService({
    // Enough latency that loading and error states are real, not theoretical.
    latencyMs: 180,
  })
}
