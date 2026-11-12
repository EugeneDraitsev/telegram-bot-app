import { logger } from '@tg-bot/common'
import { fetchBrentHistory } from './brent'
import { CRYPTO_SYMBOLS } from './crypto-currency'
import type { CurrencyHistoryDay } from './types'

/** Today and the six days before it. */
const DAYS = 7
/** Brent does not trade every day, so its closes are read from further back. */
const BRENT_DAYS_BACK = DAYS + 7
const DAY_MS = 24 * 60 * 60 * 1000
const timeout = 4_000

/**
 * One day of EUR-based rates for every currency and the major coins, from a
 * daily dataset on a CDN: free, keyless and with a file per date.
 */
const fetchRates = async (date: string) => {
  const response = await fetch(
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/eur.min.json`,
    { signal: globalThis.AbortSignal.timeout(timeout) },
  )

  if (!response.ok) {
    throw new Error(`Currency history HTTP error: ${response.status}`)
  }

  const { eur }: { eur: Record<string, number> } = await response.json()

  return Object.fromEntries(
    Object.entries(eur).map(([code, rate]) => [code.toUpperCase(), rate]),
  )
}

/**
 * The last week of daily rates and prices, oldest first. A day whose rates
 * cannot be read is left out, and Brent carries its last close over days
 * without trading.
 */
export const getCurrencyHistory = async (): Promise<CurrencyHistoryDay[]> => {
  const today = Date.now()
  const dates = Array.from({ length: DAYS }, (_, index) =>
    new Date(today - (DAYS - 1 - index) * DAY_MS).toISOString().slice(0, 10),
  )

  const [brent, days] = await Promise.all([
    fetchBrentHistory(BRENT_DAYS_BACK),
    Promise.all(
      dates.map((date) =>
        fetchRates(date).catch((error) => {
          logger.warn({ date, error }, 'currency.history_day_failed')
          return undefined
        }),
      ),
    ),
  ])

  return dates.flatMap((date, index) => {
    const rates = days[index]
    if (!rates) return []

    const prices: Record<string, number | undefined> = {
      BRENT: brent.findLast((bar) => bar.date <= date)?.close,
    }
    for (const symbol of CRYPTO_SYMBOLS) {
      prices[symbol] = rates.USD / rates[symbol]
    }

    return [{ date, rates, prices }]
  })
}
