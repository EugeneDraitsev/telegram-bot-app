const timeout = 5_000
const weatherToken = process.env.OPEN_WEATHER_MAP_TOKEN || 'set_your_token'

const WIND_DIRECTION = ['C', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ', 'C']

const ICONS = {
  '01d': '☀️',
  '01n': '🌙',
  '02d': '⛅️',
  '02n': '⛅️',
  '03d': '☁️',
  '03n': '☁️',
  '04d': '🌩',
  '04n': '🌩',
  '09d': '🌧',
  '09n': '🌧',
  '10d': '🌦',
  '10n': '🌦',
  '11d': '⛈',
  '11n': '⛈',
  '13d': '🌨',
  '13n': '🌨',
  '50d': '🌫',
  '50n': '🌫',
}

type Icon = keyof typeof ICONS

function getCountryFlagEmoji(countryCode: string) {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0))

  return String.fromCodePoint(...codePoints) || '🙈'
}

const getWeatherUrlForecast = (locationURL: string) =>
  `http://api.openweathermap.org/data/2.5/forecast/daily?q=${encodeURI(
    locationURL,
  )}&units=metric&lang=ru&APPID=${weatherToken}`

const getWeatherUrlNow = (locationURL: string) =>
  `http://api.openweathermap.org/data/2.5/weather?q=${encodeURI(
    locationURL,
  )}&units=metric&lang=ru&APPID=${weatherToken}`

const getWeatherIcon = (value: string) =>
  ICONS[value.toLowerCase() as Icon] || '🙈'

const getWindDirection = (value: number) =>
  WIND_DIRECTION[Math.round(value / 45)]

const formatTemperature = (value: number) => `<b>${value}°C</b>`

export const getWeather = async (location: string) => {
  try {
    const [infoForecast, infoNow] = await Promise.all([
      fetch(getWeatherUrlForecast(location), {
        signal: globalThis.AbortSignal.timeout(timeout),
      }).then((x) => x.json()),
      fetch(getWeatherUrlNow(location), {
        signal: globalThis.AbortSignal.timeout(timeout),
      }).then((x) => x.json()),
    ])

    const city = infoForecast.city.name
    const { country } = infoForecast.city
    const { humidity } = infoNow.main
    const wind = infoNow.wind.speed
    const dir = getWindDirection(infoNow.wind.deg)

    const temp = formatTemperature(infoNow.main.temp)
    const dayTempHigh = formatTemperature(infoForecast.list[0].temp.max)
    const dayTempLow = formatTemperature(infoForecast.list[0].temp.min)
    const nextDayTempHigh = formatTemperature(infoForecast.list[1].temp.max)
    const nextDayTempLow = formatTemperature(infoForecast.list[1].temp.min)
    const nextNextDayTempHigh = formatTemperature(infoForecast.list[2].temp.max)
    const nextNextDayTempLow = formatTemperature(infoForecast.list[2].temp.min)

    const nowDescription = infoNow.weather[0].description
    const dayDescription = infoForecast.list[0].weather[0].description
    const nextDayDescription = infoForecast.list[1].weather[0].description
    const nextNextDayDescription = infoForecast.list[2].weather[0].description

    const nowIcon = getWeatherIcon(infoNow.weather[0].icon)
    const dayIcon = getWeatherIcon(infoForecast.list[0].weather[0].icon)
    const nextDayIcon = getWeatherIcon(infoForecast.list[1].weather[0].icon)
    const nextNextDayIcon = getWeatherIcon(infoForecast.list[2].weather[0].icon)
    const flag = getCountryFlagEmoji(country)
    return `Город: ${city} регион: ${flag} ${country}\
              \nНаправление ветра: ${dir}, скорость: ${wind}м/с\
              \nТемпература: ${temp}, влажность: ${humidity}%\
              \n${nowDescription} ${nowIcon}\
              \nСегодня: ${dayTempHigh} / ${dayTempLow}, ${dayDescription} ${dayIcon}\
              \nЗавтра: ${nextDayTempHigh} / ${nextDayTempLow}, ${nextDayDescription} ${nextDayIcon}\
              \nПослезавтра: ${nextNextDayTempHigh} / ${nextNextDayTempLow}, ${nextNextDayDescription} ${nextNextDayIcon}`
  } catch (e) {
    return 'Неверно выбран населенный пункт'
  }
}
