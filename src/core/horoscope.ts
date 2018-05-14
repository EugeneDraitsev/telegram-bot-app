import fetch from 'node-fetch'

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

function getAstrologicalSigns(query: string) {
  return eng[rus.indexOf(query.toLowerCase())]
}

export const getHoroscope = async (query: string) => {
  const sign = getAstrologicalSigns(query)
  const urlToday = `https://horoscopes.rambler.ru/api/front/v1/horoscope/today/${sign}/`
  const urlTomorrow = `https://horoscopes.rambler.ru/api/front/v1/horoscope/tomorrow/${sign}/`

  if (!sign) {
    return 'Нужен Ваш зодиакальный знак'
  }

  const [today, tomorrow] = await Promise.all([
    fetch(urlToday, { timeout: 10000 }).then(x => x.json()),
    fetch(urlTomorrow, { timeout: 10000 }).then(x => x.json()),
  ])

  return `Сегодня:\n${today.text}\n\nЗавтра: \n${tomorrow.text}`
}
