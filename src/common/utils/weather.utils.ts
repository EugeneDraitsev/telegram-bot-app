import type { ForecastDay, HourlyForecast, WeatherData } from '../types'

const WEATHER_TOKEN = process.env.OPEN_WEATHER_MAP_TOKEN || ''
const TIMEOUT_MS = 5000
const HOURLY_SLOTS = 8

const WIND_DIRECTIONS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ']

const WEATHER_ICONS: Record<string, string> = {
  '01d': '☀️',
  '01n': '🌙',
  '02d': '⛅️',
  '02n': '⛅️',
  '03d': '☁️',
  '03n': '☁️',
  '04d': '☁️',
  '04n': '☁️',
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

interface OpenWeatherCurrentResponse {
  name: string
  sys: { country: string }
  main: { temp: number; feels_like: number; humidity: number }
  wind: { speed: number; deg?: number }
  weather: Array<{ description: string; icon: string }>
}

export interface OpenWeatherForecastItem {
  dt: number
  main: { temp: number; temp_min: number; temp_max: number }
  weather: Array<{ description: string; icon: string }>
  /** Probability of precipitation, 0-1. */
  pop?: number
}

interface OpenWeatherForecastResponse {
  city: {
    name: string
    country: string
    timezone?: number
  }
  list: OpenWeatherForecastItem[]
}

function getCountryFlag(countryCode: string): string {
  try {
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map((char) => 127397 + char.charCodeAt(0))
    return String.fromCodePoint(...codePoints)
  } catch {
    return '🌍'
  }
}

function getWeatherIcon(iconCode: string): string {
  return WEATHER_ICONS[iconCode.toLowerCase()] || '🌡'
}

export function getWindDirection(degrees: number): string {
  return WIND_DIRECTIONS[Math.round(degrees / 45) % 8]
}

export function buildThreeDayForecast(
  forecastItems: OpenWeatherForecastItem[],
  timezoneOffsetSeconds = 0,
): ForecastDay[] {
  const grouped = new Map<
    string,
    {
      tempHigh: number
      tempLow: number
      description: string
      icon: string
      representativeHourDelta: number
    }
  >()

  for (const item of forecastItems) {
    const localDate = new Date((item.dt + timezoneOffsetSeconds) * 1000)
    const dateKey = localDate.toISOString().slice(0, 10)
    const localHour = localDate.getUTCHours()
    const hourDeltaFromNoon = Math.abs(localHour - 12)

    const weather = item.weather?.[0]
    const description = weather?.description || 'нет данных'
    const icon = getWeatherIcon(weather?.icon || '01d')

    const existing = grouped.get(dateKey)
    if (!existing) {
      grouped.set(dateKey, {
        tempHigh: Math.round(item.main.temp_max),
        tempLow: Math.round(item.main.temp_min),
        description,
        icon,
        representativeHourDelta: hourDeltaFromNoon,
      })
      continue
    }

    existing.tempHigh = Math.max(
      existing.tempHigh,
      Math.round(item.main.temp_max),
    )
    existing.tempLow = Math.min(
      existing.tempLow,
      Math.round(item.main.temp_min),
    )

    if (hourDeltaFromNoon < existing.representativeHourDelta) {
      existing.description = description
      existing.icon = icon
      existing.representativeHourDelta = hourDeltaFromNoon
    }
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 3)
    .map(([, day]) => ({
      tempHigh: day.tempHigh,
      tempLow: day.tempLow,
      description: day.description,
      icon: day.icon,
    }))
}

export function buildHourlyForecast(
  forecastItems: OpenWeatherForecastItem[],
  timezoneOffsetSeconds = 0,
): HourlyForecast[] {
  return forecastItems.slice(0, HOURLY_SLOTS).map((item) => {
    const weather = item.weather?.[0]
    return {
      hour: new Date((item.dt + timezoneOffsetSeconds) * 1000).getUTCHours(),
      temperature: Math.round(item.main.temp),
      description: weather?.description || 'нет данных',
      icon: getWeatherIcon(weather?.icon || '01d'),
      precipitationChance: Math.round((item.pop ?? 0) * 100),
    }
  })
}

export async function getWeather(location: string): Promise<WeatherData> {
  if (!location?.trim()) {
    throw new Error('Location cannot be empty')
  }

  if (!WEATHER_TOKEN || WEATHER_TOKEN === 'set_your_token') {
    throw new Error('OpenWeatherMap token not configured')
  }

  const encodedLocation = encodeURIComponent(location)
  const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodedLocation}&units=metric&lang=ru&APPID=${WEATHER_TOKEN}`
  const currentUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodedLocation}&units=metric&lang=ru&APPID=${WEATHER_TOKEN}`

  const [forecastResponse, currentResponse] = await Promise.all([
    fetch(forecastUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) }),
    fetch(currentUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) }),
  ])

  if (!forecastResponse.ok || !currentResponse.ok) {
    throw new Error('Location not found')
  }

  const [forecastData, currentData] = (await Promise.all([
    forecastResponse.json(),
    currentResponse.json(),
  ])) as [OpenWeatherForecastResponse, OpenWeatherCurrentResponse]

  const forecastItems = forecastData.list ?? []
  const timezoneOffsetSeconds = forecastData.city?.timezone ?? 0

  const country = currentData.sys?.country || forecastData.city?.country || ''
  const city = currentData.name || forecastData.city?.name || location

  return {
    city,
    country,
    countryFlag: getCountryFlag(country),
    temperature: Math.round(currentData.main.temp),
    feelsLike: Math.round(currentData.main.feels_like),
    humidity: currentData.main.humidity,
    windSpeed: Math.round(currentData.wind.speed),
    windDirection: getWindDirection(currentData.wind.deg || 0),
    description: currentData.weather?.[0]?.description || 'нет данных',
    icon: getWeatherIcon(currentData.weather?.[0]?.icon || '01d'),
    hourly: buildHourlyForecast(forecastItems, timezoneOffsetSeconds),
    forecast: buildThreeDayForecast(forecastItems, timezoneOffsetSeconds),
  }
}

type WeatherTextFormat = 'plain' | 'html'

export function formatWeatherText(
  weather: WeatherData,
  format: WeatherTextFormat = 'plain',
): string {
  const bold = (value: string) =>
    format === 'html' ? `<b>${value}</b>` : value

  const lines = [
    `Погода: ${bold(weather.city)}, ${weather.countryFlag} ${weather.country}`,
    '',
    `${weather.icon} ${weather.description}`,
    `Температура: ${bold(`${weather.temperature}°C`)}`,
    `Влажность: ${weather.humidity}%`,
    `Ветер: ${weather.windDirection}, ${weather.windSpeed} м/с`,
    '',
    `${bold('Прогноз:')}`,
  ]

  const dayNames = ['Сегодня', 'Завтра', 'Послезавтра']
  weather.forecast.forEach((day, index) => {
    const dayName = dayNames[index] || `День ${index + 1}`
    lines.push(
      `${dayName}: ${day.icon} ${day.tempHigh}°/${day.tempLow}°, ${day.description}`,
    )
  })

  return lines.join('\n')
}
