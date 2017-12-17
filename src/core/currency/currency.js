const rp = require('request-promise')
const parseString = require('xml2js').parseString
const { round, includes } = require('lodash')


function getRussianCurrency() {
  const currencyCodes = ['usd', 'eur', 'brent']
  const url = 'https://meduza.io/api/v3/stock/all'
  return rp.get({ url, timeout: 10000 }).then((response) => {
    const currency = JSON.parse(response)
    return `Курсы медузы:\n${Object.keys(currency)
      .filter(curr => includes(currencyCodes, curr))
      .reduce((message, key) =>
        message.concat(`${key.toUpperCase()}: ${Number(currency[key].current).toFixed(2)}\n`), '')}`
  })
}

function getBelarusCurrency() {
  const currencyCodes = ['USD', 'EUR', 'RUB']
  const url = 'http://www.nbrb.by/Services/XmlExRates.aspx?ondate='
  // temporary increased
  return rp.get({ url, timeout: 15000 }).then(responce => new Promise((resolve) => {
    parseString(responce, (err, result) => {
      const message = `Курсы НБРБ:\n${result.DailyExRates.Currency
        .filter(currency => includes(currencyCodes, currency.CharCode[0]))
        .reduce((acc, currency) =>
          acc.concat(`${currency.CharCode[0]}: ${Number(currency.Rate).toFixed(4)}\n`), '')}`
      resolve(message)
    })
  }))
}

function getCryptoCurrency() {
  const url = 'https://poloniex.com/public?command=returnTicker'
  return rp.get({ url, timeout: 10000 }).then((response) => {
    const currency = JSON.parse(response)
    const filteredCurrency = {
      BTC: `${round(currency.USDT_BTC.highestBid)} / ${round(currency.USDT_BTC.lowestAsk)}`,
      ETH: `${round(currency.USDT_ETH.highestBid, 2)} / ${round(currency.USDT_ETH.lowestAsk, 2)}`,
      XRP: `${round(currency.USDT_XRP.highestBid, 4)} / ${round(currency.USDT_XRP.lowestAsk, 4)}`,
    }
    return `Курсы криптовалют:\n${
      Object.keys(filteredCurrency)
        .reduce((message, key) => message.concat(`${key}: ${filteredCurrency[key]}\n`), '')}`
  })
}

function getCurrency() {
  const promises = [
    getBelarusCurrency().catch(() => 'error getting currency from nbrb'),
    getRussianCurrency().catch(() => 'error getting currency from meduza'),
    getCryptoCurrency().catch(() => 'error getting currency from poloniex'),
  ]
  return Promise.all(promises)
    .then(result => `Курсы валют:\n\n${result.join('\n')}`)
}

module.exports = { getCurrency }
