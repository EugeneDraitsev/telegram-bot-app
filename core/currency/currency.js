'use strict'
const rp = require('request-promise')
const url = 'https://meduza.io/api/v3/stock/all'
const parseString = require('xml2js').parseString
const _ = require('lodash')

function getCurrency() {
  return Promise.all([getBelarusCurrency().catch(() => 'error getting currency from nbrb'),
    getRussianCurrency().catch(() => 'error getting currency from meduza')])
    .then((result) => {
      return `Курсы валют:\n\n${result.join('\n')}`
    })
}

function getRussianCurrency() {
  const currencyCodes = ['usd', 'eur', 'brent']
  return rp.post(url).then((response) => {
    const currency = JSON.parse(response)
    return 'Курсы медузы:\n' + Object.keys(currency)
        .filter(currency => _.includes(currencyCodes, currency))
        .reduce((message, key) =>
          message.concat(`${key.toUpperCase()}: ${Number(currency[key].current).toFixed(2)}\n`), '')
  })
}

function getBelarusCurrency() {
  const currencyCodes = ['USD', 'EUR', 'RUB']
  return rp.get({url: 'http://www.nbrb.by/Services/XmlExRates.aspx?ondate=', timeout: 5000}).then((result) => {
    return new Promise(resolve => {
      parseString(result, (err, result) => {
        const message = 'Курсы НБРБ:\n' + result.DailyExRates.Currency
            .filter(currency => _.includes(currencyCodes, currency.CharCode[0]))
            .reduce((message, currency) =>
              message.concat(`${currency.CharCode[0]}: ${Number(currency.Rate).toFixed(4)}\n`), '')
        resolve(message)
      })
    })
  })
}

module.exports = {getCurrency}
