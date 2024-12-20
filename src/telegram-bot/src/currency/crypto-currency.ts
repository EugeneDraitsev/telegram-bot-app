import { getFile, getRoundedDate, round, saveFile } from '@tg-bot/common'

interface CoinMarketCurrency {
  symbol: string
  quote: {
    USD: {
      price: number
      percent_change_1h: number
      percent_change_24h: number
    }
  }
}

interface PoloniexCurrency {
  symbol: string
  price: string
  time: string
  dailyChange: string
  ts: string
}

const timeout = 15000
const coinMarketCapApiKey =
  process.env.COIN_MARKET_CAP_API_KEY || 'set_your_token'
const cryptoRequestsBucketName =
  process.env.CRYPTO_REQUESTS_BUCKET_NAME || 'set_your_bucket_name'
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

const formatCoinMarketCapResult = (currencies: CoinMarketCurrency[]) => {
  const data = Object.keys(symbols).map((symbol) => {
    const currency = currencies.find(
      (c: CoinMarketCurrency) => c.symbol === symbol,
    )

    if (!currency) {
      return ''
    }

    const { price, percent_change_24h } = currency.quote.USD
    const isUp = percent_change_24h >= 0
    const formattedPrice = formatCurrency(price, symbols[symbol as Symbol])

    const priceChange = round(percent_change_24h, 2)

    return [symbol, `${formattedPrice} (${isUp ? '+' : ''}${priceChange}%)`]
  })

  const maxLength = Math.max(
    ...data.map(([key, value]) => value.length + key.length),
  )
  const result = data
    .map(([key, value]) => formatRow(key, value, maxLength))
    .join('\n')

  return `Курсы криптовалют (coinMarketcap):\n<pre>${result}</pre>`
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

const getCoinMarketCapData = async (): Promise<string> => {
  const url =
    'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest'
  const roundedDate = String(getRoundedDate(5).valueOf())
  const savedDataString = await getFile(
    cryptoRequestsBucketName,
    roundedDate,
  ).catch(() => null)
  const savedData = JSON.parse(savedDataString || '{}')

  if (!savedDataString) {
    const params = new URLSearchParams({
      start: '1',
      limit: '100',
      convert: 'USD',
    })
    const response = await fetch(`${url}?${params}`, {
      headers: { 'X-CMC_PRO_API_KEY': coinMarketCapApiKey },
      signal: globalThis.AbortSignal.timeout(timeout),
    }).then((res) => res.json())

    const currencies = response.data
    const filteredCurrencies = currencies.filter(
      (c: CoinMarketCurrency) => symbols[c.symbol as Symbol],
    )
    await saveFile(
      cryptoRequestsBucketName,
      roundedDate,
      Buffer.from(JSON.stringify(filteredCurrencies)),
    )

    return formatCoinMarketCapResult(filteredCurrencies)
  }

  return formatCoinMarketCapResult(savedData)
}

export const getCryptoCurrency = async (): Promise<string> => {
  try {
    return getCoinMarketCapData()
  } catch (e) {
    console.log('CoinMarketCap error: ', e)
    return getPoloniexData()
  }
}
