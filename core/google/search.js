'use strict'
const _ = require('lodash')
const rp = require('request-promise')
const imageService = require('../image/png')
const googleSearchToken = process.env.GOOGLE_SEARCH_TOKEN || 'set_your_token'
const cxToken = process.env.GOOGLE_CX_TOKEN || 'set_your_token'

function searchImage(query) {
  const url = 'https://www.googleapis.com/customsearch/v1?searchType=image&imgSize=xlarge&alt=json&num=10&start=1' +
    `&key=${googleSearchToken}&cx=${cxToken}&q=${encodeURI(query)}`

  return new Promise((resolve, reject) => {
    rp.get(url)
      .then((response) => {
        const responseData = JSON.parse(response)
        if (responseData && responseData.items && responseData.items.length > 0) {
          const image = _.sample(responseData.items)
          const imageUrl = image.link
          const tbUrl = image.image.thumbnailLink
          imageService.getImage(imageUrl, tbUrl)
            .then(response => resolve({image: response.body, url: imageUrl}))
            .catch(() => reject(`Can't load image: ${imageUrl}`))
        }
        else {
          reject(`Google can't find ${query} for you`);
        }
      })
      .catch(() => reject('ERROR getting search result from google'))
  })
}

module.exports = {searchImage}
