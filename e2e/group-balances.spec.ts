import { expect, test } from '@playwright/test'

const owner = 'E2E'
const members = ['Member One', 'Member Two', 'Member Three']

test('creates a group and verifies simplified settlement payments', async ({ page }) => {
  const groupName = `E2E Trip ${Date.now()}`
  const email = `e2e-${Date.now()}@example.com`

  await page.goto('/')
  await page.getByRole('link', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: 'Create an account', exact: true }).click()
  await page.getByLabel('Name').fill(owner)
  await page.getByLabel('Email').fill(email)
  await page.locator('input[type="password"]').fill('password123')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page).toHaveURL('/')

  await page.getByRole('link', { name: 'Groups', exact: true }).click()
  await page.getByRole('button', { name: 'Create group', exact: true }).first().click()
  const createDialog = page.getByRole('dialog', { name: 'Create a group' })
  await createDialog.getByLabel('Group name').fill(groupName)
  await createDialog.getByRole('button', { name: 'Create group', exact: true }).click()
  await expect(page.getByRole('heading', { name: groupName })).toBeVisible()

  await page.getByRole('tab', { name: 'Members', exact: true }).click()
  for (const member of members) {
    await page.getByLabel('New member name').fill(member)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText(member, { exact: true })).toBeVisible()
  }
  await expect(page.locator('.member-list .member')).toHaveCount(4)

  await addExpense(page, 'Hotel', '12000', owner)
  await addExpense(page, 'Transport', '4000', members[0])

  await page.getByRole('tab', { name: 'Balances', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Balances' })).toBeVisible()

  // Four members share both expenses equally. Owner paid ₦12,000 and Member
  // One paid ₦4,000, so the net positions are +₦8,000, settled, -₦4,000,
  // and -₦4,000 respectively.
  await expect(balanceCard(page, owner)).toContainText('₦8,000')
  await expect(balanceCard(page, members[0])).toContainText('₦0')
  await expect(balanceCard(page, members[1])).toContainText('-₦4,000')
  await expect(balanceCard(page, members[2])).toContainText('-₦4,000')

  const debts = page.locator('.debt-list > .debt')
  await expect(debts).toHaveCount(2)
  await expect(debts.nth(0)).toContainText(`${members[1]} owes ${owner} ₦4,000`)
  await expect(debts.nth(1)).toContainText(`${members[2]} owes ${owner} ₦4,000`)
})

async function addExpense(page: import('@playwright/test').Page, description: string, amount: string, payer: string) {
  await page.getByRole('button', { name: 'Add expense', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add expense' })
  await dialog.getByLabel('Description').fill(description)
  await dialog.getByLabel(/Total amount/).fill(amount)
  await expect(dialog.getByRole('button', { name: /Equally/ })).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByLabel('Payer', { exact: true }).selectOption({ label: payer })
  await dialog.getByRole('button', { name: 'Add expense', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('tab', { name: 'Expenses', exact: true }).click()
  await expect(page.getByText(description, { exact: true })).toBeVisible()
}

function balanceCard(page: import('@playwright/test').Page, name: string) {
  return page.locator('.balance-card').filter({ hasText: name }).first()
}
