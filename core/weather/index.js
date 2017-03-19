'use strict'

const rp = require('request-promise')

const dayRus = ['Понедельник', 'Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье']
const dayEng = ['Mon', 'Tue','Wed','Thu','Fri','Sat','Sun']
const conditionsEng = ['tornado', 'tropical storm', 'hurricane', 'severe thunderstorms', 'thunderstorms', 'rain and snow', 'rain and sleet', 'snow and sleet', 'freezing drizzle', ' 	drizzle', 'freezing rain', 'showers', 'snow flurries', 'light snow showers', 'blowing snow', ' 	snow', ' 	hail', 'sleet', 'dust', 'foggy', 'haze', 'smoky', 'blustery', 'windy', 'cold', 'cloudy', 'mostly cloudy', 'partly cloudy', 'clear', 'sunny', 'fair', 'rain and hail', 'hot', 'isolated thunderstorms', 'scattered thunderstorms', 'scattered showers', 'heavy snow', 'scattered snow showers', 'partly cloudy', 'thundershowers', 'snow showers', 'isolated thundershowers']
const conditionsRus = ['торнадо', 'тропический шторм', 'ураган', 'сильные грозы', 'грозы', 'дождь и снег', 'дождь и мокрый снег', 'дождь и мокрый снег', 'изморозь', 'мелкий дождь', 'ледяной дождь', 'ливень', 'порывы снега', 'небольшой снег', 'низовая метель', 'снег', 'град', 'мокрый снег', 'пыль', 'туман', 'дымка', 'дымка', 'ветренно', 'ветренно', 'холодно', 'облачно', 'в основном облачно', 'переменная облачность', 'ясно', 'солнечно', 'ясно', 'дождь и град', 'жарко', 'местами грозы', 'рассеянные грозы', 'рассеянный ливень', 'снегопад', 'ливневый дождь', 'переменная облачность', 'ливневый дождь', 'снегопад', 'ливневый дождь']
const windDir = ['C', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ', 'C']
function getWeatherUrl(locationURL) {
  return `https://query.yahooapis.com/v1/public/yql?q=select%20*%20from%20weather.forecast%20where%20woeid%20in%20(${encodeURI(`select woeid from geo.places(1) where text=\'${locationURL}\'`)})&format=json&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys`
}
function mphToMps(mph){
  return Math.round(mph*0.44704)
}
function fahrenheitToCelsius(f){
  return Math.round((f-32)/2*1.1)
}
function weekDay(value){
  return dayRus[dayEng.indexOf(value)]
}
function conditions(value){
  return conditionsRus[conditionsEng.indexOf(value.toLowerCase())]
}
function windDirection(value){
  return windDir[Math.round(value/45)]
}
function getWeather(location) {
  location = location || 'Минск'
  return rp.get({url: getWeatherUrl(location), timeout: 5000}).then((result) => {
    return new Promise(resolve => {
      const info = JSON.parse(result).query.results
      if (info == null){
        resolve('Непарвильно выбран населенный пункт')
      }
      const city = info.channel.location.city
      const country = info.channel.location.country
      const wind = mphToMps(info.channel.wind.speed)
      const direction = windDirection(info.channel.wind.direction)
      const humidity = info.channel.atmosphere.humidity
      const temp = fahrenheitToCelsius(info.channel.item.condition.temp)
      const dayTempHigh = fahrenheitToCelsius(info.channel.item.forecast[0].high), dayTempLow = fahrenheitToCelsius(info.channel.item.forecast[0].low)
      const nextTempHigh = fahrenheitToCelsius(info.channel.item.forecast[1].high), nextTempLow = fahrenheitToCelsius(info.channel.item.forecast[1].low)
      const nextNextTempHigh = fahrenheitToCelsius(info.channel.item.forecast[2].high), nextNextTempLow = fahrenheitToCelsius(info.channel.item.forecast[2].low)
      const text = conditions(info.channel.item.condition.text)
      const dayText = conditions(info.channel.item.forecast[0].text)
      const nextText = conditions(info.channel.item.forecast[1].text)
      const nextNextText = conditions(info.channel.item.forecast[2].text)
      const dayStr = info.channel.item.condition.date, day = weekDay(dayStr.substring(0,3))
      resolve(`Город: ${city} страна: ${country}\n${day}\nНаправление ветра: ${direction}, скорость: ${wind}м/с\nТемпература: ${temp}°C, влажность: ${humidity}%\n${text}\nСегодня: ${dayTempHigh}°C/${dayTempLow}°C, ${dayText}\nЗавтра: ${nextTempHigh}°C/${nextTempLow}°C, ${nextText}\nПослезавтра: ${nextNextTempHigh}°C/${nextNextTempLow}°C, ${nextNextText}`)
    })
  })
}

module.exports = {getWeather}
