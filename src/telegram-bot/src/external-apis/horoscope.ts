import { normalize } from '@tg-bot/common/utils'

const timeout = 10_000
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
      fetch(urlToday, { signal: AbortSignal.timeout(timeout) }).then((x) =>
        x.json(),
      ),
      fetch(urlTomorrow, { signal: AbortSignal.timeout(timeout) }).then((x) =>
        x.json(),
      ),
    ])

    return `<b>Сегодня:</b>\n\n${normalize(
      today.text,
    )}\n\n<b>Завтра:</b>\n\n${normalize(tomorrow.text)}`
  } catch (e) {
    return 'Request error 😿'
  }
}
