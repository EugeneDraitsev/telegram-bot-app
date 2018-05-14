import fetch from 'node-fetch'
import { parseString } from 'xml2js'

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

interface IHoroscope {
  horo: {} []
}

export const getHoroscope = async (query: string) => {
  const sign = getAstrologicalSigns(query)
  const url = 'http://img.ignio.com/r/export/utf/xml/daily/com.xml'

  if (!sign) {
    return 'Нужен Ваш зодиакальный знак'
  }

  const response = await fetch(url, { timeout: 10000 })
  const xml = await response.text()

  const result = await new Promise((resolve, reject) =>
    parseString(xml, (err, res: IHoroscope) => err ? reject(err) : resolve(res))) as IHoroscope

  const prediction = result.horo[sign][0]
  return `${query}\nВчера:${prediction.yesterday}\nСегодня:${prediction.today}\nЗавтра:${prediction.tomorrow}`
}
