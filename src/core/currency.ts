import { includes, map, round } from 'lodash'
import fetch from 'node-fetch'

const fccApiKey = process.env.FCC_API_KEY || 'set_your_token'
const fixerKey = process.env.FIXER_API_KEY || 'set_your_token'

const timeout = 15000

const getRussianCurrency = async (): Promise<string> => {
  const currencyCodes = ['usd', 'eur', 'brent']
  const url = 'https://meduza.io/api/v3/stock/all'
  const response = await fetch(url, { timeout })
  const currency = await response.json()

  return `Курсы медузы:\n${Object.keys(currency)
    .filter((curr) => includes(currencyCodes, curr))
    .reduce(
      (message, key) => message.concat(`${key.toUpperCase()}: ${Number(currency[key].current).toFixed(2)}\n`),
      '',
    )}`
}

const getFreeCurrencyData = async (): Promise<string> => {
  const currencies = ['USD_BYN', 'EUR_BYN', 'USD_SEK', 'EUR_SEK'].join(',')
  const url = `https://free.currencyconverterapi.com/api/v6/convert?compact=y&apiKey=${fccApiKey}&q=${currencies}`

  const result = await fetch(url, { timeout }).then((x) => x.json())

  if (result.error) {
    throw new Error(result.error)
  }

  const currencyMessage = map(result,
    (value, key) => `${key.replace('_', '/')}: ${round(value.val, 4)}`).join('\n')

  return `Курсы FCC:\
          \n${currencyMessage}
`
}

const getFixerData = async (): Promise<string> => {
  const url = `http://data.fixer.io/api/latest?access_key=${fixerKey}&format=1&base=EUR`
  const { rates } = await fetch(url, { timeout }).then((x) => x.json())

  return `Курсы fixer:\
          \nUSD/BYN: ${round(rates.BYN / rates.USD, 3)}\
          \nEUR/BYN: ${round(rates.BYN, 3)}\
          \nUSD/SEK: ${round(rates.SEK / rates.USD, 3)}\
          \nEUR/SEK: ${round(rates.SEK, 3)}
`
}

const getCryptoCurrency = async (): Promise<string> => {
  const url = 'https://poloniex.com/public?command=returnTicker'
  const response = await fetch(url, { timeout })
  const currency = await response.json()
  const filteredCurrency = {
    BTC: `${round(currency.USDT_BTC.highestBid)} / ${round(currency.USDT_BTC.lowestAsk)}`,
    ETH: `${round(currency.USDT_ETH.highestBid, 2)} / ${round(currency.USDT_ETH.lowestAsk, 2)}`,
    XRP: `${round(currency.USDT_XRP.highestBid, 4)} / ${round(currency.USDT_XRP.lowestAsk, 4)}`,
  }
  return `Курсы криптовалют:\n${
    Object.keys(filteredCurrency)
      .reduce((message, key) => message.concat(`${key}: ${filteredCurrency[key]}\n`), '')}`
}

const getError = (err: Error, from: string): string => {
  // eslint-disable-next-line no-console
  console.log(err)
  return `Can't fetch currency from ${from}`
}

const getMainCurrencies = async (): Promise<string> => {
  try {
    return await getFreeCurrencyData()
  } catch (e) {
    const result = await getFixerData()
    return result
  }
}

export const getCurrency = (): Promise<string> => {
  const promises = [
    getMainCurrencies().catch((err) => getError(err, 'FFC and Fixer')),
    getRussianCurrency().catch((err) => getError(err, 'meduza')),
    getCryptoCurrency().catch((err) => getError(err, 'poloniex')),
  ]

  return Promise.all(promises)
    .then((result) => `${result.join('\n')}`)
}
