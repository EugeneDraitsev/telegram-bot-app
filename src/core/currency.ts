import { chunk, includes, map, round } from 'lodash'
import fetch from 'node-fetch'

import { segments } from '../'

const apiKey = process.env.FCC_API_KEY || 'set_your_token'

const timeout = 15000

const getRussianCurrency = async () => {
  const currencyCodes = ['usd', 'eur', 'brent']
  const url = 'https://meduza.io/api/v3/stock/all'
  const response = await fetch(url, { timeout })
  const currency = await response.json()

  return `Курсы медузы:\n${Object.keys(currency)
    .filter(curr => includes(currencyCodes, curr))
    .reduce(
      (message, key) => message.concat(`${key.toUpperCase()}: ${Number(currency[key].current).toFixed(2)}\n`),
      '')}`
}

const getFreeCurrencyData = async () => {
  const currencyPairs = ['USD_BYN', 'EUR_BYN', 'USD_SEK', 'EUR_SEK']
  const url = `https://free.currencyconverterapi.com/api/v6/convert?compact=y&apiKey=${apiKey}&q=`

  const promises = chunk(currencyPairs, 2).map(x => x.join(','))
  const results = await Promise.all(promises.map(async x => await fetch(`${url}${x}`)))
  const jsons = await Promise.all(results.map(x => x.json()))
  const data = jsons.reduce((a, b) => ({ ...a, ...b }))

  return `Курсы FCC:
${map(data, (value, key) => `${key.replace('_', '/')}: ${round(value.val, 4)}`).join('\n')}
`
}

const getCryptoCurrency = async () => {
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

const getError = (err: Error, from: string) => {
  segments.querySegment.addError(err)
  return `error getting currency from ${from}`
}

export const getCurrency = () => {
  const promises = [
    getFreeCurrencyData().catch(err => getError(err, 'FFC')),
    getRussianCurrency().catch(err => getError(err, 'meduza')),
    getCryptoCurrency().catch(err => getError(err, 'poloniex')),
  ]

  return Promise.all(promises)
    .then(result => `${result.join('\n')}`)
}
