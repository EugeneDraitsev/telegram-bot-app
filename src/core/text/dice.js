const _ = require('lodash')

function getRandomDice(number = 6) {
  const max = number > 100 ? 100 : number
  return _.padStart(_.random(1, max), 3, '0')
}

const throwDice = number => `\`\`\`\n  ___\n/     \\\n| ${getRandomDice(number)} |\n\\     /\n  ¯¯¯\`\`\``

module.exports = { throwDice }
