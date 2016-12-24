'use strict'
const rp = require('request-promise')
const parseString = require('xml2js').parseString

const rus = ['овен', 'телец', 'близнецы', 'рак', 'лев', 'дева', 'весы', 'скорпион', 'стрелец', 'козерог', 'водолей', 'рыбы']
const eng = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces']

function getAstrologicalSigns(query) {
  return eng[rus.indexOf(query.toLowerCase())]
}


function getHoroscope(query) {
  return rp.get({url: 'http://img.ignio.com/r/export/utf/xml/daily/com.xml', timeout: 5000}).then((result) => {
    return new Promise(resolve => {
      parseString(result, (err, result) => {
        const sign = getAstrologicalSigns(query)
        const prediction = sign ? result.horo[sign][0] : ''
        resolve(sign ? `${query}\nВчера:${prediction.yesterday}\nСегодня:${prediction.today}\nЗавтра:${prediction.tomorrow}` :
          'Нужен Ваш зодиакальный знак')
      })
    })
  })
}

module.exports = {getHoroscope}
