import axios from 'axios'

import { normalize } from '../utils'

const rus = [
  'овен',
  'телец',
  'близнецы',
  'рак',
  'лев',
  'дева',
  'весы',
  'скорпион',
  'стрелец',
  'козерог',
  'водолей',
  'рыбы',
]

const eng = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
]

function getAstrologicalSigns(query: string): string {
  return eng[rus.indexOf(query.toLowerCase())]
}

export const getHoroscope = async (query: string): Promise<string> => {
  try {
    const sign = getAstrologicalSigns(query)
    const urlToday = `https://horoscopes.rambler.ru/api/front/v1/horoscope/today/${sign}/`
    const urlTomorrow = `https://horoscopes.rambler.ru/api/front/v1/horoscope/tomorrow/${sign}/`

    if (!sign) {
      return 'Нужен Ваш зодиакальный знак'
    }

    const [today, tomorrow] = await Promise.all([
      axios(urlToday, { timeout: 10000 }).then((x) => x.data),
      axios(urlTomorrow, { timeout: 10000 }).then((x) => x.data),
    ])

    return `<b>Сегодня:</b>\n\n${normalize(today.text)}\n
<b>Завтра:</b>\n\n${normalize(tomorrow.text)}`
  } catch (e) {
    return 'Request error 😿'
  }
}
