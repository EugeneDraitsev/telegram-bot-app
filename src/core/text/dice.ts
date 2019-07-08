import { padStart, random, clamp } from 'lodash'

function getRandomDice(number: number) {
  const max = clamp(number, 2, 999)

  return padStart(String(random(1, max)), 3, '0')
}

export const throwDice = (number: number) =>
  `\`\`\`\n  ___\n/     \\\n| ${getRandomDice(number)} |\n\\     /\n  ¯¯¯\`\`\``
