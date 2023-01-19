import axios from 'axios'
import { round } from 'lodash'
import { getFile, getRoundedDate, saveFile } from '@tg-bot/common'
import { Bucket } from 'aws-sdk/clients/s3'

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

const timeout = 15000
const coinMarketCapApiKey = process.env.COIN_MARKET_CAP_API_KEY || 'set_your_token'
const cryptoRequestsBucketName = process.env.CRYPTO_REQUESTS_BUCKET_NAME as Bucket
const symbols = { BTC: 2, ETH: 2, ADA: 3, CERE: 4 }

const formatRow = (key: string, value: string, length = 10) => {
  return `${key}: ${value.padStart(length - key.length, ' ')}`
}

const getPoloniexData = async (): Promise<string> => {
  const url = 'https://poloniex.com/public?command=returnTicker'
  const response = await axios(url, { timeout })
  const currency = response.data

  const filteredCurrency = Object.keys(symbols).reduce((acc, key) => {
    const currencyData = currency[`USDT_${key}`]

    if (currencyData) {
      acc[key] = parseFloat(currencyData.highestBid)
        .toLocaleString('en', {
          maximumFractionDigits: symbols[key],
        })
        .replaceAll(',', ' ')
    }

    return acc
  }, {} as Record<string, string>)

  const maxLength = Math.max(
    ...Object.entries(filteredCurrency).map(([key, value]) => key.length + value.length),
  )

  const resultString = Object.entries(filteredCurrency)
    .map(([key, value]) => formatRow(key, value, maxLength))
    .join('\n')

  return `Курсы криптовалют:\n<pre>${resultString}</pre>`
}

const getCurrenciesResult = (currencies: CoinMarketCurrency[]) => {
  const data = Object.keys(symbols).map((symbol) => {
    const currency = currencies.find((c: CoinMarketCurrency) => c.symbol === symbol)

    if (!currency) {
      return ''
    }

    const { price, percent_change_24h } = currency.quote.USD
    const isUp = percent_change_24h >= 0
    const formattedPrice = price
      .toLocaleString('en', {
        maximumFractionDigits: symbols[symbol],
      })
      .replaceAll(',', ' ')

    const priceChange = round(percent_change_24h, 2)

    return [symbol, `${formattedPrice} (${isUp ? '+' : ''}${priceChange}%)`]
  })

  const maxLength = Math.max(...data.map(([key, value]) => value.length + key.length))
  const result = data.map(([key, value]) => formatRow(key, value, maxLength)).join('\n')

  return `Курсы криптовалют:\n<pre>${result}</pre>`
}

const getCoinMarketCapData = async (): Promise<string> => {
  const url = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest'
  const roundedDate = String(getRoundedDate(5).valueOf())
  const savedDataBuffer = await getFile(cryptoRequestsBucketName, roundedDate).catch(() => null)
  const savedDate = JSON.parse(savedDataBuffer?.Body?.toString() || '{}')

  if (!savedDataBuffer) {
    const response = await axios(url, {
      timeout,
      params: { start: 1, limit: 5_000, convert: 'USD' },
      headers: {
        'X-CMC_PRO_API_KEY': coinMarketCapApiKey,
      },
    })
    const currencies = response.data.data
    const filteredCurrencies = currencies.filter((c: CoinMarketCurrency) => symbols[c.symbol])
    await saveFile(
      cryptoRequestsBucketName,
      roundedDate,
      Buffer.from(JSON.stringify(filteredCurrencies)),
    )

    return getCurrenciesResult(filteredCurrencies)
  }

  return getCurrenciesResult(savedDate)
}

export const getCryptoCurrency = async (): Promise<string> => {
  try {
    return await getCoinMarketCapData()
  } catch (e) {
    console.log(`CoinMarketCap error: `, e)
    return getPoloniexData()
  }
}
