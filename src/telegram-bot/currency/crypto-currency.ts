import { logger, round } from '@tg-bot/common'
import { buildCurrencyFallbackText } from './format'
import type { CurrencyRateRow, CurrencyRateSection } from './types'

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
const symbols = { BTC: 2, ETH: 2, ADA: 3 }

type Symbol = keyof typeof symbols

/* Helpers */
const formatCurrency = (value: string | number, fractionDigits = 2) =>
  Number.parseFloat(value as string)
    .toLocaleString('en', {
      maximumFractionDigits: fractionDigits,
    })
    .replaceAll(',', ' ')

const formatPercent = (value: number) =>
  `${value >= 0 ? '+' : ''}${round(value, 2)}%`

/* Main Functions */

const getPoloniexData = async (): Promise<CurrencyRateSection> => {
  const url = 'https://api.poloniex.com/markets/price'
  const currencyRates: PoloniexCurrency[] = await fetch(url, {
    signal: globalThis.AbortSignal.timeout(timeout),
  }).then((res) => res.json())

  const rows = Object.keys(symbols).reduce((acc, key) => {
    const currencyData = currencyRates?.find((x) => x.symbol === `${key}_USDT`)

    if (currencyData) {
      const formattedPrice = formatCurrency(
        currencyData.price,
        symbols[key as Symbol],
      )
      const priceChange = Number.parseFloat(currencyData.dailyChange) * 100
      acc.push({
        label: key,
        value: `$${formattedPrice} (${formatPercent(priceChange)})`,
      })
    }

    return acc
  }, [] as CurrencyRateRow[])

  return {
    title: 'Крипта',
    provider: 'Poloniex',
    columns: ['Монета', 'Цена / 24ч'],
    rows,
  }
}

const getOkxData = async (): Promise<CurrencyRateSection> => {
  const url = new URL('https://www.okx.com/api/v5/market/tickers')
  url.searchParams.append('instType', 'SPOT')

  const response = await fetch(url, {
    signal: globalThis.AbortSignal.timeout(timeout),
  })

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }

  const { data }: OkxResponse = await response.json()

  const rows = Object.keys(symbols).reduce((acc, key) => {
    const currencyData = data?.find((x) => x.instId === `${key}-USDT`)

    if (currencyData) {
      const formattedPrice = formatCurrency(
        currencyData.last,
        symbols[key as Symbol],
      )

      const priceChangePercent =
        (Number.parseFloat(currencyData.last) /
          Number.parseFloat(currencyData.open24h) -
          1) *
        100
      acc.push({
        label: key,
        value: `$${formattedPrice} (${formatPercent(priceChangePercent)})`,
      })
    }

    return acc
  }, [] as CurrencyRateRow[])

  return {
    title: 'Крипта',
    provider: 'OKX',
    columns: ['Монета', 'Цена / 24ч'],
    rows,
  }
}

export const getCryptoCurrencySection =
  async (): Promise<CurrencyRateSection> => {
    try {
      return await getOkxData()
    } catch (e) {
      logger.error({ error: e }, 'OKX error')
      return getPoloniexData()
    }
  }

export const getCryptoCurrency = async (): Promise<string> =>
  buildCurrencyFallbackText([await getCryptoCurrencySection()])
