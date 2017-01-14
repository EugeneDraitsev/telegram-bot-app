'use strict'
const rp = require('request-promise')

function getImage(url, tbUrl) {
  return rp.get({url, resolveWithFullResponse: true, encoding: null})
    .then(response => isResponseImage(response.headers) ? response : Promise.reject())
    .catch(() => {
      if (tbUrl) {
        return rp.get({url: tbUrl, resolveWithFullResponse: true, encoding: null})
          .then(response => isResponseImage(response.headers) ? response : Promise.reject())
      }
    })
}

function isResponseImage(headers) {
  return headers && headers['content-type'] && headers['content-type'].split('/')[0] === 'image'
}

module.exports = {getImage}
