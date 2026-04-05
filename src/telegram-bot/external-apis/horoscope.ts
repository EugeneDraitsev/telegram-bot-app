import { logger } from '@tg-bot/common'
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

function formatHoroscopeResponse(data: {
  content: { text: Array<{ content: string }> }
}) {
  return data?.content?.text?.map((x) => x.content).join('\n')
}

export const getHoroscope = async (query: string): Promise<string> => {
  try {
    const sign = getAstrologicalSigns(query)
    const urlToday = `https://horoscopes.rambler.ru/api/front/v3/horoscope/general/${sign}/today/`
    const urlTomorrow = `https://horoscopes.rambler.ru/api/front/v3/horoscope/general/${sign}/tomorrow/`

    if (!sign) {
      return 'Нужен Ваш зодиакальный знак'
    }

    const [today, tomorrow] = await Promise.all([
      fetch(urlToday, { signal: globalThis.AbortSignal.timeout(timeout) }).then(
        (x) => x.json(),
      ),
      fetch(urlTomorrow, {
        signal: globalThis.AbortSignal.timeout(timeout),
      }).then((x) => x.json()),
    ])

    return `<b>Сегодня:</b>\n\n${normalize(
      formatHoroscopeResponse(today),
    )}\n\n<b>Завтра:</b>\n\n${formatHoroscopeResponse(tomorrow)}`
  } catch (e) {
    logger.error({ error: e }, 'getHoroscope error')
    return 'Request error 😿'
  }
}
