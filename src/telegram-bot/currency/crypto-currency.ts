import { logger, round } from '@tg-bot/common'
import type { CurrencyRateSection } from './types'

export interface OkxResponse {
  code: string
  msg: string
  data: OkxSpotData[]
}

export interface OkxSpotData {
  instType: string
  instId: string
  last: string
  lastSz: string
  askPx: string
  askSz: string
  bidPx: string
  bidSz: string
  open24h: string
  high24h: string
  low24h: string
  volCcy24h: string
  vol24h: string
  ts: string
  sodUtc0: string
  sodUtc8: string
}

interface PoloniexCurrency {
  symbol: string
  price: string
  time: string
  dailyChange: string
  ts: string
}

const timeout = 15000
/** Coins the bot quotes, with the fraction digits each price is shown with. */
const symbols = { BTC: 2, ETH: 2, ADA: 3 }

type Symbol = keyof typeof symbols

export const CRYPTO_SYMBOLS = Object.keys(symbols) as Symbol[]

export interface CryptoQuote {
  readonly symbol: Symbol
  /** Price in USD. */
  readonly price: number
  /** Change over the last 24 hours, in percent. */
  readonly changePercent: number
}

/* Helpers */
const formatCurrency = (value: number, fractionDigits = 2) =>
  value
    .toLocaleString('en', {
      maximumFractionDigits: fractionDigits,
    })
    .replaceAll(',', ' ')

const formatPercent = (value: number) =>
  `${value >= 0 ? '+' : ''}${round(value, 2)}%`

/* Main Functions */

const getPoloniexQuotes = async (): Promise<CryptoQuote[]> => {
  const url = 'https://api.poloniex.com/markets/price'
  const currencyRates: PoloniexCurrency[] = await fetch(url, {
    signal: globalThis.AbortSignal.timeout(timeout),
  }).then((res) => res.json())

  return CRYPTO_SYMBOLS.flatMap((symbol) => {
    const currencyData = currencyRates?.find(
      (x) => x.symbol === `${symbol}_USDT`,
    )

    return currencyData
      ? [
          {
            symbol,
            price: Number.parseFloat(currencyData.price),
            changePercent: Number.parseFloat(currencyData.dailyChange) * 100,
          },
        ]
      : []
  })
}

const getOkxQuotes = async (): Promise<CryptoQuote[]> => {
  const url = new URL('https://www.okx.com/api/v5/market/tickers')
  url.searchParams.append('instType', 'SPOT')

  const response = await fetch(url, {
    signal: globalThis.AbortSignal.timeout(timeout),
  })

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }

  const { data }: OkxResponse = await response.json()

  return CRYPTO_SYMBOLS.flatMap((symbol) => {
    const currencyData = data?.find((x) => x.instId === `${symbol}-USDT`)
    if (!currencyData) return []

    const price = Number.parseFloat(currencyData.last)
    return [
      {
        symbol,
        price,
        changePercent:
          (price / Number.parseFloat(currencyData.open24h) - 1) * 100,
      },
    ]
  })
}

export const getCryptoQuotes = async (): Promise<{
  provider: string
  quotes: CryptoQuote[]
}> => {
  try {
    return { provider: 'OKX', quotes: await getOkxQuotes() }
  } catch (e) {
    logger.error({ error: e }, 'OKX error')
    return { provider: 'Poloniex', quotes: await getPoloniexQuotes() }
  }
}

export const getCryptoCurrencySection =
  async (): Promise<CurrencyRateSection> => {
    const { provider, quotes } = await getCryptoQuotes()

    return {
      title: 'Крипта',
      provider,
      columns: ['Монета', 'Цена / 24ч'],
      rows: quotes.map(({ symbol, price, changePercent }) => ({
        label: symbol,
        value: `$${formatCurrency(price, symbols[symbol])} (${formatPercent(changePercent)})`,
      })),
    }
  }
