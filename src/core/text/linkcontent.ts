import { sample } from 'lodash'

const APPRECIATION = [
  'Ух контент.',
  'Бля, ты опять?!',
  'А вот это заебись!...а не, тоже говно.',
  'Уносиии!',
  'Опять насрали...',
  'Ясно',
  'А вот это заебись!',
  'Om-nom-nom-nom',
  'Moar',

]

export const sayThanksForLink = (): string => String(sample(APPRECIATION))
