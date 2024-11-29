import { clamp, random } from '@tg-bot/common/utils'

const randomDice = (max: number) => random(1, max)

const getRandomDice = (number: number, randomFn = randomDice) => {
  const max = clamp(number, 2, 999)

  return String(randomFn(max)).padStart(3, '0')
}

export const throwDice = (number: number, randomFn = randomDice) =>
  `<pre>\n  ___\n/     \\\n| ${getRandomDice(number, randomFn)} |\n\\     /\n  ¯¯¯</pre>`
