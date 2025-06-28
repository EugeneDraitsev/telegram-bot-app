import { hasRussiansLetters } from '@tg-bot/common/utils'

const englishLayout = "qwertyuiop[]asdfghjkl;'zxcvbnm,./`"
const russianLayout = 'йцукенгшщзхъфывапролджэячсмитьбю.ё'

export const puntoSwitcher = (text: string): string => {
  const isRussianText = hasRussiansLetters(text)
  return text
    .split('')
    .map((char) =>
      isRussianText
        ? englishLayout[russianLayout.indexOf(char)] || char
        : russianLayout[englishLayout.indexOf(char)] || char,
    )
    .join('')
}
