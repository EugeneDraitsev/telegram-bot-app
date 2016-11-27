"use strict"
const rp = require('request-promise')
const url = "https://meduza.io/api/v3/stock/all"

function getCurrency() {
  return rp.post(url).then((response) => {
    const currency = JSON.parse(response)
    delete (currency.intouch)
    return Object.keys(currency).reduce((obj, key) => {
      return Object.assign(obj, {[key]: currency[key].current})
    }, {})
  }).catch(e => {
    const message = `ERROR getting currency from meduza: ${e}`
    return message
  })
}

module.exports = {getCurrency}
