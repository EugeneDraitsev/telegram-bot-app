import { sample } from 'lodash'

const convertText = (text: string): string => {
  if (text.length == 0) {
    return 'VoVa обоcралZя'
  }

  if (/[зЗвВ]/.test(text)) {
    return text..replaceAll(/[зЗ]/g, 'Z').replaceAll(/[вВ]/g, 'V')
  } else {
    return String(sample([
      'Ваш текст недостаточно патриотичен. Попробуйте ещё раз.',
      'Не могу сейчас ответить из-за санкций.',
      'Послушай, а где ты был все эти 8 лет?',
      'Zzzz',
      'А в Америке негров линчуют!!!'
    ]))
  }
}

export const zavovu = (text: string): string => convertText(text)
