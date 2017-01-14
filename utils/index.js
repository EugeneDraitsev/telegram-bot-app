'use strict'
const hasRussiansLetters = (text) => text.match && text.match(/^[А-Яа-яёЁ]+/)

module.exports = {hasRussiansLetters}
