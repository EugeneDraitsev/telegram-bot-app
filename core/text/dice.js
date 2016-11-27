'use strict'
const _ = require('lodash')

const throwDice = (number) => `\`\`\`\n  ___\n/     \\\n| ${getRandomDice(number)} |\n\\     /\n  ¯¯¯\`\`\``

function getRandomDice(number) {
  const max = number ? number > 100 ? 100 : number : 6
  return _.padStart(_.random(1, max), 3, '0')
}

module.exports = {throwDice}
