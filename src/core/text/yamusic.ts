import { sample } from 'lodash'

const APPRECIATION = [
  'Спасибо, слушай это говно сам))))))00',
  'Бля, ты опять?!',
  'А вот это заебись!...а не, тоже говно.'
]

export const sayThanksForYaLink = () => {
  return String(sample(APPRECIATION))
}
