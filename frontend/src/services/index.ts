import { createHttpService } from './http/httpService'
import type { EvenlyService } from './types'

export * from './types'
export { createMockService } from './mock/mockService'
export { createHttpService } from './http/httpService'
export { DEMO_CREDENTIALS } from './mock/seed'

/** Create the service used by the application. The UI talks to the API by default. */
export function createService(): EvenlyService {
  return createHttpService({ baseUrl: import.meta.env?.VITE_API_BASE_URL || '/api' })
}
