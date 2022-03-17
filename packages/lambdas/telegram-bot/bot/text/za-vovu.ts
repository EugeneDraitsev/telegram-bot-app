import { sample } from 'lodash'

export const ANSWERS = [
  'Ваш текст недостаточно патриотичен. Попробуйте ещё раз.',
  'Не могу сейчас ответить из-за санкций.',
  'Послушай, а где ты был все эти 8 лет?',
  'Zzzz',
  'А в Америке негров линчуют!!!',
]

const convertText = (text: string): string => {
  if (!text.length) {
    return 'VoVa обоcралZя'
  }

  if (/[зЗвВ]/g.test(text)) {
    return text.replace(/[зЗ]/g, 'Z').replace(/[вВ]/g, 'V')
  } else {
    return String(sample(ANSWERS))
  }
}

export const zavovu = (text: string): string => convertText(text)
