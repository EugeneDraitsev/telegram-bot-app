'use strict'

const _ = require('lodash')
const MIN_LENGTH = 3

const huify = (text) => text.length < MIN_LENGTH ? text : text.replace(/[А-Я0-9]+/ig, huifyWord)

function huifyWord(word) {
  const patterns = [/^[бвгджзйклмнпрстфхчцшщ]*[оеёэ]/, /^[бвгджзйклмнпрстфхчцшщ]*[ую]/, /^[бвгджзйклмнпрстфхчцшщ]*[ая]/,
    /^[бвгджзйклмнпрстфхчцшщ]*[иы]/]
  const mainPattern = /^[бвгджзйклмнпрстфхчцшщ]*./

  switch (_.findIndex(patterns, pattern => pattern.test(word))) {
    case 0:
      return word.replace(mainPattern, 'хуе')
    case 1:
      return word.replace(mainPattern, 'хую')
    case 2:
      return word.replace(mainPattern, 'хуя')
    case 3:
      return word.replace(mainPattern, 'хуи')
  }
}

module.exports = {huify}