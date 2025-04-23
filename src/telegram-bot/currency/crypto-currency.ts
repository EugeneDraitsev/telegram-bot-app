import { round } from '@tg-bot/common'

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

const formatRow = (key: string, value: string, length = 10) => {
  return `${key}: ${value.padStart(length - key.length, ' ')}`
}

/* Main Functions */

const getPoloniexData = async (): Promise<string> => {
  const url = 'https://api.poloniex.com/markets/price'
  const currencyRates: PoloniexCurrency[] = await fetch(url, {
    signal: globalThis.AbortSignal.timeout(timeout),
  }).then((res) => res.json())

  const filteredCurrency = Object.keys(symbols).reduce(
    (acc, key) => {
      const currencyData = currencyRates?.find(
        (x) => x.symbol === `${key}_USDT`,
      )

      if (currencyData) {
        const formattedPrice = formatCurrency(
          currencyData.price,
          symbols[key as Symbol],
        )
        const priceChange = round(
          Number.parseFloat(currencyData.dailyChange) * 100,
          2,
        )
        const isUp = Number.parseFloat(currencyData.dailyChange) >= 0
        acc[key] = `${formattedPrice} (${isUp ? '+' : ''}${priceChange}%)`
      }

      return acc
    },
    {} as Record<string, string>,
  )

  const maxLength = Math.max(
    ...Object.entries(filteredCurrency).map(
      ([key, value]) => key.length + value.length,
    ),
  )

  const resultString = Object.entries(filteredCurrency)
    .map(([key, value]) => formatRow(key, value, maxLength))
    .join('\n')

  return `Курсы криптовалют (poloniex):\n<pre>${resultString}</pre>`
}

const getOkxData = async () => {
  const url = new URL('https://www.okx.com/api/v5/market/tickers')
  url.searchParams.append('instType', 'SPOT')

  const response = await fetch(url, {
    signal: globalThis.AbortSignal.timeout(timeout),
  })

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }

  const { data }: OkxResponse = await response.json()

  const filteredCurrency = Object.keys(symbols).reduce(
    (acc, key) => {
      const currencyData = data?.find((x) => x.instId === `${key}-USDT`)

      if (currencyData) {
        const formattedPrice = formatCurrency(
          currencyData.last,
          symbols[key as Symbol],
        )

        const priceChangePercent = round(
          (Number.parseFloat(currencyData.last) /
            Number.parseFloat(currencyData.open24h) -
            1) *
            100,
          2,
        )
        const isUp = priceChangePercent >= 0
        acc[key] =
          `${formattedPrice} (${isUp ? '+' : ''}${priceChangePercent}%)`
      }

      return acc
    },
    {} as Record<string, string>,
  )

  const maxLength = Math.max(
    ...Object.entries(filteredCurrency).map(
      ([key, value]) => key.length + value.length,
    ),
  )

  const resultString = Object.entries(filteredCurrency)
    .map(([key, value]) => formatRow(key, value, maxLength))
    .join('\n')

  return `Курсы криптовалют (okx):\n<pre>${resultString}</pre>`
}

export const getCryptoCurrency = async (): Promise<string> => {
  try {
    return getOkxData()
  } catch (e) {
    console.error('OKX error: ', e)
    return getPoloniexData()
  }
}
