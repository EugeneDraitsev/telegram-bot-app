'use strict'

const _ = require('lodash')

const huify = (text) => text.replace(/[А-Я0-9]+/ig, huifyWord)

const consonants = ['бвгджзйклмнпрстфхчцшщ']
const patterns = [new RegExp(`^[${consonants}]*[оеёэ]`), new RegExp(`^[${consonants}]*[ую]`),
  new RegExp(`^[${consonants}]*[ая]`), new RegExp(`^[${consonants}]*[иы]`)]
const mainPattern = new RegExp(`^[${consonants}].*`)

function huifyWord(word) {
  switch (_.findIndex(patterns, pattern => pattern.test(word))) {
    case 0:
      return word.replace(mainPattern, 'хуе')
    case 1:
      return word.replace(mainPattern, 'хую')
    case 2:
      return word.replace(mainPattern, 'хуя')
    case 3:
      return word.replace(mainPattern, 'хуи')
    default:
      return word
  }
}

module.exports = {huify}
