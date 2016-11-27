'use strict'
function hasRussiansLetters(text) {
  return text.match && text.match(/^[А-Яа-яёЁ]+/)
}

module.exports = {hasRussiansLetters}
