'use strict'
const _ = require('lodash')

function throwDice(number) {
  return `\`\`\`\n  ___\n/     \\\n| ${getRandomDice(number)} |\n\\     /\n  ¯¯¯\`\`\``
}

function getRandomDice(number) {
  const max = number ? number > 100 ? 100 : number : 6
  return diceNumberLen(_.random(1, max))
}

function diceNumberLen(number) {
  let numberString = String(number);
  while (numberString.length < 3) {
    numberString = "0" + numberString;
  }
  return numberString;
}

module.exports = {throwDice};
