const rp = require('request-promise')
const parseString = require('xml2js').parseString
const _ = require('lodash')

function getCurrency() {
  const promises = [
    getBelarusCurrency().catch(() => 'error getting currency from nbrb'),
    getRussianCurrency().catch(() => 'error getting currency from meduza'),
    getCryptoCurrency().catch(() => 'error getting currency from cryptocompare')
  ]
  return Promise.all(promises)
    .then((result) => {
      return `Курсы валют:\n\n${result.join('\n')}`
    })
}

function getRussianCurrency() {
  const currencyCodes = ['usd', 'eur', 'brent']
  const url = 'https://meduza.io/api/v3/stock/all'
  return rp.get({url, timeout: 10000}).then((response) => {
    const currency = JSON.parse(response)
    return 'Курсы медузы:\n' + Object.keys(currency)
      .filter(currency => _.includes(currencyCodes, currency))
      .reduce((message, key) =>
        message.concat(`${key.toUpperCase()}: ${Number(currency[key].current).toFixed(2)}\n`), '')
  })
}

function getBelarusCurrency() {
  const currencyCodes = ['USD', 'EUR', 'RUB']
  const url = 'http://www.nbrb.by/Services/XmlExRates.aspx?ondate='
  //temporary increased
  return rp.get({url, timeout: 15000}).then((result) => {
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

function getCryptoCurrency() {
  const currencyCodes = ['BTC', 'ETH', 'XRP']
  const toCurrencyCodes = ['USD']
  const url = `https://min-api.cryptocompare.com/data/pricemulti?fsyms=${currencyCodes}&tsyms=${toCurrencyCodes}`
  return rp.get({url, timeout: 10000}).then((response) => {
    const currency = JSON.parse(response)
    return 'Курсы криптовалют:\n' +
      Object.keys(currency)
        .reduce((message, key) => message.concat(`${key}: ${currency[key].USD}\n`), '')
  })
}

module.exports = {getCurrency}
