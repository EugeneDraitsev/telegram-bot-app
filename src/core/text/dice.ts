import { padStart, random, clamp } from 'lodash-es'

const getRandomDice = (number: number): string => {
  const max = clamp(number, 2, 999)

  return padStart(String(random(1, max)), 3, '0')
}

export const throwDice = (number: number): string =>
  `\`\`\`\n  ___\n/     \\\n| ${getRandomDice(number)} |\n\\     /\n  ¯¯¯\`\`\``
