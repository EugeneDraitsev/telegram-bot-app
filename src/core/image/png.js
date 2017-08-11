/* eslint-disable no-confusing-arrow */
const rp = require('request-promise')

function isResponseImage(headers) {
  return headers && headers['content-type'] && headers['content-type'].split('/')[0] === 'image'
}

function getImage(url, tbUrl) {
  return rp.get({ url, resolveWithFullResponse: true, encoding: null })
    .then(response => isResponseImage(response.headers) ? response : Promise.reject())
    .catch(() => {
      if (tbUrl) {
        return rp.get({ url: tbUrl, resolveWithFullResponse: true, encoding: null })
          .then(res => isResponseImage(res.headers) ? res : Promise.reject())
      }
      return null
    })
}


module.exports = { getImage }
