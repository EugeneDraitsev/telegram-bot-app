'use strict'
const rp = require('request-promise')
const url = "https://meduza.io/api/v3/stock/all"
const parseString = require('xml2js').parseString
const _ = require('lodash')

function getCurrency() {
  return Promise.all([getBelarusCurrency(), getRussianCurrency()]).then((result) => {
    return `Курсы валют:\n\n${result.join('\n')}`
  })
}

function getRussianCurrency() {
  const currencyCodes = ['usd', 'eur', 'brent']
  return rp.post(url).then((response) => {
    const currency = JSON.parse(response)
    return 'Курсы медузы:\n' + Object.keys(currency)
        .filter(currency => _.includes(currencyCodes, currency))
        .reduce((message, key) => {
          return message.concat(`${key.toUpperCase()}: ${Number(currency[key].current).toFixed(2)}\n`)
        }, '')
  }).catch(() => 'error getting currency from meduza')
}

function getBelarusCurrency() {
  const currencyCodes = ['USD', 'EUR', 'RUB']
  return rp.get('http://www.nbrb.by/Services/XmlExRates.aspx?ondate=').then((result) => {
    return new Promise(resolve => {
      parseString(result, (err, result) => {
        const message = 'Курсы НБРБ:\n' + result.DailyExRates.Currency
            .filter(currency => _.includes(currencyCodes, currency.CharCode[0]))
            .reduce((message, currency) => {
              return message.concat(`${currency.CharCode[0]}: ${Number(currency.Rate).toFixed(2)}\n`)
            }, '')
        resolve(message)
      })
    }).catch(() => 'error getting currency from nbrb')
  })
}

module.exports = {getCurrency}
