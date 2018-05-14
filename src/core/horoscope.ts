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
  const url = `https://horoscopes.rambler.ru/api/front/v1/horoscope/today/${sign}/`

  if (!sign) {
    return 'Нужен Ваш зодиакальный знак'
  }

  const { text } = await fetch(url, { timeout: 10000 }).then(x => x.json())

  return text
}
