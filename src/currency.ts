import { includes, map, round, noop } from 'lodash'
import axios from 'axios'

const fccApiKey = process.env.FCC_API_KEY || 'set_your_token'
const fixerKey = process.env.FIXER_API_KEY || 'set_your_token'

const timeout = 15000

const getRussianCurrency = async (): Promise<string> => {
  const currencyCodes = ['usd', 'eur']
  const medusaUrl = 'https://meduza.io/api/v3/stock/all'
  const nasdaqUrl = 'https://api.nasdaq.com/api/quote/BZ%3ANMX/info?assetclass=commoditie'

  const currency = await axios(medusaUrl, { timeout })
    .then((x) => x.data)
    .catch(noop)

  const brentPrice =
    currency?.brent?.current ||
    (await axios(nasdaqUrl, { timeout: 5000 })
      .then((x) => x.data?.summaryData?.LastSalePrice?.value)
      .catch(noop))

  const currencyString = Object.keys(currency)
    .filter((curr) => includes(currencyCodes, curr))
    .reduce(
      (value, key) =>
        value.concat(`${key.toUpperCase()}: ${Number(currency[key].current).toFixed(2)}\n`),
      '',
    )

  const brentString = brentPrice ? `BRENT: ${brentPrice}\n` : ''

  return `Курсы медузы:\n${currencyString}${brentString}`
}

const getFreeCurrencyData = async (): Promise<string> => {
  const currencies = ['USD_BYN', 'EUR_BYN', 'USD_SEK', 'EUR_SEK'].join(',')
  const url = `https://free.currconv.com/api/v7/convert?compact=y&apiKey=${fccApiKey}&q=${currencies}`

  const result = await axios(url, { timeout }).then((x) => x.data)

  if (result.error) {
    throw new Error(result.error)
  }

  const currencyMessage = map(
    result,
    (value, key) => `${key.replace('_', '/')}: ${round(value.val, 4)}`,
  ).join('\n')

  return `Курсы FCC:\n${currencyMessage}\n`
}

const getFixerData = async (): Promise<string> => {
  const url = `http://data.fixer.io/api/latest?access_key=${fixerKey}&format=1&base=EUR`
  const { rates } = await axios(url, { timeout }).then((x) => x.data)

  return `Курсы fixer:\
          \nUSD/BYN: ${round(rates.BYN / rates.USD, 3)}\
          \nEUR/BYN: ${round(rates.BYN, 3)}\
          \nUSD/SEK: ${round(rates.SEK / rates.USD, 3)}\
          \nEUR/SEK: ${round(rates.SEK, 3)}
`
}

const getCryptoCurrency = async (): Promise<string> => {
  const url = 'https://poloniex.com/public?command=returnTicker'
  const response = await axios(url, { timeout })
  const currency = response.data
  const filteredCurrency = {
    BTC: `${round(currency.USDT_BTC.highestBid)} / ${round(currency.USDT_BTC.lowestAsk)}`,
    ETH: `${round(currency.USDT_ETH.highestBid, 2)} / ${round(currency.USDT_ETH.lowestAsk, 2)}`,
    XRP: `${round(currency.USDT_XRP.highestBid, 4)} / ${round(currency.USDT_XRP.lowestAsk, 4)}`,
  }
  return `Курсы криптовалют:\n${Object.keys(filteredCurrency).reduce(
    (message, key) => message.concat(`${key}: ${filteredCurrency[key]}\n`),
    '',
  )}`
}

const getError = (err: Error, from: string): string => {
  // eslint-disable-next-line no-console
  console.log(err)
  return `Can't fetch currency from ${from}\n`
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

  return Promise.all(promises).then((result) => `${result.join('\n')}`)
}
