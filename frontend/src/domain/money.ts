/**
 * All money in Evenly is stored and computed as an integer number of minor units
 * (kobo for NGN). Floating point naira would make allocations fail to reconcile,
 * and the spec requires that totals, balances and allocations always reconcile.
 */

export type Kobo = number

export const MINOR_UNITS_PER_MAJOR = 100

export type CurrencyCode = 'NGN'

export const DEFAULT_CURRENCY: CurrencyCode = 'NGN'

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  NGN: '₦',
}

/** Parse user input in major units ("45,000.50") into kobo. Returns null if unparseable. */
export function parseAmount(input: string): Kobo | null {
  const cleaned = input.replace(/[,\s₦]/g, '')
  if (cleaned === '' || !/^-?\d*(\.\d*)?$/.test(cleaned)) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return Math.round(value * MINOR_UNITS_PER_MAJOR)
}

export function toMajor(amount: Kobo): number {
  return amount / MINOR_UNITS_PER_MAJOR
}

export function fromMajor(amount: number): Kobo {
  return Math.round(amount * MINOR_UNITS_PER_MAJOR)
}

/** Format kobo for display. Whole amounts drop the decimals: ₦45,000 not ₦45,000.00 */
export function formatMoney(amount: Kobo, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? ''
  const negative = amount < 0
  const abs = Math.abs(amount)
  const hasFraction = abs % MINOR_UNITS_PER_MAJOR !== 0
  const formatted = (abs / MINOR_UNITS_PER_MAJOR).toLocaleString('en-NG', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })
  return `${negative ? '-' : ''}${symbol}${formatted}`
}

/** Editable string form of an amount, for pre-filling form inputs. */
export function amountToInput(amount: Kobo): string {
  return amount % MINOR_UNITS_PER_MAJOR === 0
    ? String(amount / MINOR_UNITS_PER_MAJOR)
    : (amount / MINOR_UNITS_PER_MAJOR).toFixed(2)
}

export function sum(amounts: Kobo[]): Kobo {
  return amounts.reduce((total, amount) => total + amount, 0)
}

/**
 * Split `total` across `weights` proportionally, in exact minor units.
 *
 * Uses largest-remainder so the parts always add back up to `total`: each part
 * gets the floor of its exact share, then the leftover units go one-by-one to
 * the parts with the biggest dropped fraction (ties broken by original order,
 * so the result is deterministic).
 */
export function allocateByWeight(total: Kobo, weights: number[]): Kobo[] {
  const totalWeight = weights.reduce((acc, w) => acc + w, 0)
  if (weights.length === 0) return []
  if (totalWeight <= 0) return weights.map(() => 0)

  const exact = weights.map((w) => (total * w) / totalWeight)
  const floors = exact.map((value) => Math.floor(value))
  let remainder = total - floors.reduce((acc, value) => acc + value, 0)

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)

  const result = [...floors]
  for (let i = 0; remainder > 0 && i < order.length; i += 1) {
    result[order[i].index] += 1
    remainder -= 1
  }
  return result
}
