import { includes, round } from 'lodash'
import fetch from 'node-fetch'
import { parseString } from 'xml2js'

import { segments } from '../'

interface INbrbResponse {
  DailyExRates: {
    Currency: {
      CharCode: string,
      Rate: string,
    } [],
  }
}

const getRussianCurrency = async () => {
  const currencyCodes = ['usd', 'eur', 'brent']
  const url = 'https://meduza.io/api/v3/stock/all'
  const response = await fetch(url, { timeout: 10000 })
  const currency = await response.json()

  return `Курсы медузы:\n${Object.keys(currency)
    .filter(curr => includes(currencyCodes, curr))
    .reduce(
      (message, key) => message.concat(`${key.toUpperCase()}: ${Number(currency[key].current).toFixed(2)}\n`),
      '')}`
}

const getBelarusCurrency = async () => {
  const currencyCodes = ['USD', 'EUR', 'RUB']
  const url = 'http://www.nbrb.by/Services/XmlExRates.aspx?ondate='

  const response = await fetch(url, { timeout: 10000 })
  const xml = await response.text()
  const result = await new Promise((resolve, reject) =>
    parseString(xml, (err, res: INbrbResponse) => err ? reject(err) : resolve(res))) as INbrbResponse

  return `Курсы НБРБ:\n${result.DailyExRates.Currency
    .filter(currency => includes(currencyCodes, currency.CharCode[0]))
    .reduce(
      (acc, currency) => acc.concat(`${currency.CharCode[0]}: ${Number(currency.Rate).toFixed(4)}\n`), '',
    )}`
}

const getCryptoCurrency = async () => {
  const url = 'https://poloniex.com/public?command=returnTicker'
  const response = await fetch(url, { timeout: 10000 })
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
    getBelarusCurrency().catch(err => getError(err, 'nbrb')),
    getRussianCurrency().catch(err => getError(err, 'meduza')),
    getCryptoCurrency().catch(err => getError(err, 'poloniex')),
  ]

  return Promise.all(promises)
    .then(result => `Курсы валют:\n\n${result.join('\n')}`)
}
