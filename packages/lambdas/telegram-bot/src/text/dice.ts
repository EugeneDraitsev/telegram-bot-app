import { padStart, random, clamp } from 'lodash'

const randomDice = (max: number) => random(1, max)

const getRandomDice = (number: number, randomFn = randomDice): string => {
  const max = clamp(number, 2, 999)

  return padStart(String(randomFn(max)), 3, '0')
}

export const throwDice = (number: number, randomFn = randomDice): string =>
  `<pre>\n  ___\n/     \\\n| ${getRandomDice(number, randomFn)} |\n\\     /\n  ¯¯¯</pre>`
