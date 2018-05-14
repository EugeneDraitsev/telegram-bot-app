import { padStart, random } from 'lodash'

function getRandomDice(number: number) {
  const max = number > 100 ? 100 : number
  return padStart(String(random(1, max)), 3, '0')
}

export const throwDice = (number: number) =>
  `\`\`\`\n  ___\n/     \\\n| ${getRandomDice(number)} |\n\\     /\n  ¯¯¯\`\`\``
