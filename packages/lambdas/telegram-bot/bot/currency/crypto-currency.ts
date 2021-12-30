import axios from 'axios'
import { round } from 'lodash'

const timeout = 15000
const coinMarketCapApiKey = process.env.COIN_MARKET_CAP_API_KEY || 'set_your_token'

const getPoloniexData = async (): Promise<string> => {
  const url = 'https://poloniex.com/public?command=returnTicker'
  const response = await axios(url, { timeout })
  const currency = response.data
  const filteredCurrency = {
    BTC: `${round(currency.USDT_BTC.highestBid)} / ${round(currency.USDT_BTC.lowestAsk)}`,
    ETH: `${round(currency.USDT_ETH.highestBid, 2)} / ${round(currency.USDT_ETH.lowestAsk, 2)}`,
    XRP: `${round(currency.USDT_XRP.highestBid, 4)} / ${round(currency.USDT_XRP.lowestAsk, 4)}`,
  }

  const resultString = Object.keys(filteredCurrency).reduce(
    (message, key) => message.concat(`${key}: ${filteredCurrency[key]}\n`),
    '',
  )

  return `Курсы криптовалют:\n${resultString}`
}

interface CoinMarketCurrency {
  symbol: string
  quote: {
    USD: {
      price: number
      percent_change_1h: number
    }
  }
}

const getCoinMarketCapData = async (): Promise<string> => {
  const symbols = { BTC: 2, ETH: 2, XRP: 4, ADA: 3, CERE: 4 }
  const url = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest'

  const response = await axios(url, {
    timeout,
    params: { start: 1, limit: 5_000, convert: 'USD' },
    headers: {
      'X-CMC_PRO_API_KEY': coinMarketCapApiKey,
    },
  })

  const currencies = response.data.data
  const data = Object.keys(symbols).map((symbol) => {
    const currency = currencies.find((c: CoinMarketCurrency) => c.symbol === symbol)

    if (!currency) {
      return ''
    }

    const { price, percent_change_24h } = currency.quote.USD
    const isUp = percent_change_24h >= 0
    const formattedPrice = round(price, symbols[symbol])
    const priceChange = round(percent_change_24h, 2)

    return `${symbol}: ${formattedPrice} (${isUp ? '+' : ''}${priceChange}%)`
  })

  return `Курсы криптовалют:\n${data.join('\n')}`
}

export const getCryptoCurrency = async (): Promise<string> => {
  try {
    return await getCoinMarketCapData()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(`CoinMarketCap error: `, e)
    return getPoloniexData()
  }
}
