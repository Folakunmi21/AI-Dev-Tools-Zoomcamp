import { describe, expect, it } from 'vitest'
import { fromMajor } from '../src/domain/money'
import { createMockService } from '../src/services/mock/mockService'
import { memoryStorage } from '../src/services/mock/db'
import { DEMO_CREDENTIALS } from '../src/services/mock/seed'
import { ServiceError } from '../src/services/types'

const makeService = () => createMockService({ seed: false, latencyMs: 0, storage: memoryStorage() })

async function register(service: ReturnType<typeof makeService>, email = 'ada@example.com') {
  await service.auth.register({ name: 'Ada Example', email, password: 'password123' })
}

async function createBasicGroup(service: ReturnType<typeof makeService>) {
  const group = await service.groups.create({ name: 'Flat', memberNames: ['Bola'] })
  const detail = await service.groups.get(group.id)
  return { group, detail }
}

describe('mock service', () => {
  it('supports guests creating quick splits without authentication', async () => {
    const service = makeService()
    const quick = await service.groups.createQuickSplit({ memberNames: ['Ada', 'Bola'] })
    const detail = await service.groups.get(quick.id)
    expect(quick.kind).toBe('quick')
    expect(detail.members.map((member) => member.displayName)).toEqual(['Ada', 'Bola'])
    await expect(service.groups.list()).resolves.toEqual([])
  })

  it('requires authentication for saved groups and protects credentials', async () => {
    const service = makeService()
    await expect(service.groups.create({ name: 'Private' })).rejects.toMatchObject({ code: 'unauthenticated' })
    await register(service)
    const session = await service.auth.getSession()
    expect(session.user).not.toHaveProperty('password')
    await expect(service.groups.create({ name: '   ' })).rejects.toMatchObject({ code: 'validation' })
  })

  it('validates, persists, and recalculates an expense', async () => {
    const storage = memoryStorage()
    const service = createMockService({ seed: false, latencyMs: 0, storage })
    await register(service)
    const { group, detail } = await createBasicGroup(service)
    const [ada, bola] = detail.members
    const created = await service.expenses.create({
      groupId: group.id,
      description: 'Dinner',
      totalAmount: fromMajor(30),
      expenseDate: '2025-01-10',
      splitMethod: 'equal',
      payers: [{ memberId: ada.id, amount: fromMajor(30) }],
      participants: [{ memberId: ada.id }, { memberId: bola.id }],
    })
    expect(created.participants.map((participant) => participant.calculatedAmount)).toEqual([1500, 1500])
    const afterCreate = await service.groups.get(group.id)
    expect(afterCreate.balances.debts).toContainEqual(expect.objectContaining({ fromMemberId: bola.id, toMemberId: ada.id, outstandingAmount: 1500 }))

    const reloaded = createMockService({ seed: false, latencyMs: 0, storage })
    expect((await reloaded.groups.get(group.id)).expenses[0].id).toBe(created.id)
  })

  it('soft deletes only the creator expense while preserving audit history', async () => {
    const service = makeService()
    await register(service)
    const { group, detail } = await createBasicGroup(service)
    const [ada, bola] = detail.members
    const created = await service.expenses.create({
      groupId: group.id,
      description: 'Taxi',
      totalAmount: 1000,
      expenseDate: '2025-01-10',
      splitMethod: 'equal',
      payers: [{ memberId: ada.id, amount: 1000 }],
      participants: [{ memberId: ada.id }, { memberId: bola.id }],
    })
    await service.expenses.remove(created.id)
    const result = await service.groups.get(group.id)
    expect(result.expenses).toHaveLength(0)
    expect(result.balances.debts).toHaveLength(0)
    expect(result.activities.some((activity) => activity.action === 'expense_deleted' && activity.entityId === created.id)).toBe(true)
    await expect(service.expenses.get(created.id)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('marks a debt paid, creates activity, and notifies other members', async () => {
    const service = createMockService({ seed: true, latencyMs: 0, storage: memoryStorage() })
    await service.auth.login(DEMO_CREDENTIALS)
    const detail = await service.groups.get('grp_lagos')
    const debt = detail.balances.debts.find((item) => item.outstandingAmount > 0)
    expect(debt).toBeDefined()
    await service.settlements.markDebtPaid({ groupId: 'grp_lagos', fromMemberId: debt!.fromMemberId, toMemberId: debt!.toMemberId, amount: 1 })
    const updated = await service.groups.get('grp_lagos')
    expect(updated.activities[0].action).toBe('debt_marked_paid')
    await service.notifications.markAllRead()
    expect(await service.notifications.unreadCount()).toBe(0)
  })

  it('rejects non-image and oversized receipts', async () => {
    const service = makeService()
    await expect(service.uploads.uploadReceipt(new File(['text'], 'note.txt', { type: 'text/plain' }))).rejects.toBeInstanceOf(ServiceError)
    await expect(service.uploads.uploadReceipt(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }))).rejects.toMatchObject({ code: 'validation' })
  })
})
