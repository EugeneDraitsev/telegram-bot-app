import type { WeatherData } from '../../types'
import {
  buildHourlyForecast,
  buildThreeDayForecast,
  formatWeatherText,
  getWindDirection,
} from '..'
import type { OpenWeatherForecastItem } from '../weather.utils'

const makeWeatherData = (
  overrides: Partial<WeatherData> = {},
): WeatherData => ({
  city: 'Минск',
  country: 'BY',
  countryFlag: '🇧🇾',
  temperature: 22,
  feelsLike: 21,
  humidity: 65,
  windSpeed: 4,
  windDirection: 'СВ',
  description: 'ясно',
  icon: '☀️',
  hourly: [],
  forecast: [
    { tempHigh: 24, tempLow: 16, description: 'ясно', icon: '☀️' },
    { tempHigh: 20, tempLow: 14, description: 'облачно', icon: '☁️' },
    { tempHigh: 18, tempLow: 12, description: 'дождь', icon: '🌧' },
  ],
  ...overrides,
})

describe('getWindDirection', () => {
  test('returns correct direction for cardinal points', () => {
    expect(getWindDirection(0)).toBe('С')
    expect(getWindDirection(90)).toBe('В')
    expect(getWindDirection(180)).toBe('Ю')
    expect(getWindDirection(270)).toBe('З')
  })

  test('returns correct direction for intercardinal points', () => {
    expect(getWindDirection(45)).toBe('СВ')
    expect(getWindDirection(135)).toBe('ЮВ')
    expect(getWindDirection(225)).toBe('ЮЗ')
    expect(getWindDirection(315)).toBe('СЗ')
  })

  test('wraps around at 360°', () => {
    expect(getWindDirection(360)).toBe('С')
  })

  test('rounds to nearest direction', () => {
    expect(getWindDirection(22)).toBe('С')
    expect(getWindDirection(23)).toBe('СВ')
  })
})

describe('formatWeatherText', () => {
  test('plain format has no HTML tags', () => {
    const text = formatWeatherText(makeWeatherData(), 'plain')

    expect(text).not.toContain('<b>')
    expect(text).toContain('Минск')
    expect(text).toContain('22°C')
    expect(text).toContain('Сегодня')
    expect(text).toContain('Завтра')
    expect(text).toContain('Послезавтра')
  })

  test('html format wraps values in <b> tags', () => {
    const text = formatWeatherText(makeWeatherData(), 'html')

    expect(text).toContain('<b>Минск</b>')
    expect(text).toContain('<b>22°C</b>')
    expect(text).toContain('<b>Прогноз:</b>')
  })

  test('defaults to plain format', () => {
    const text = formatWeatherText(makeWeatherData())
    expect(text).not.toContain('<b>')
  })

  test('includes forecast days', () => {
    const text = formatWeatherText(makeWeatherData())

    expect(text).toContain('24°/16°')
    expect(text).toContain('20°/14°')
    expect(text).toContain('18°/12°')
  })
})

describe('buildHourlyForecast', () => {
  test('keeps the next 8 slots with local hours and rounded values', () => {
    const items: OpenWeatherForecastItem[] = Array.from(
      { length: 10 },
      (_, index) => ({
        dt: 1705316400 + index * 3 * 3600, // 2024-01-15 11:00 UTC, 3h steps
        main: { temp: -2.6 + index, temp_min: -5, temp_max: 5 },
        weather: [{ description: 'снег', icon: '13d' }],
        pop: index ? 0.456 : undefined,
      }),
    )

    const hourly = buildHourlyForecast(items, 3 * 3600)

    expect(hourly).toHaveLength(8)
    expect(hourly[0]).toEqual({
      hour: 14,
      temperature: -3,
      description: 'снег',
      icon: '🌨',
      precipitationChance: 0,
    })
    expect(hourly[1]).toMatchObject({ hour: 17, precipitationChance: 46 })
    expect(hourly[4].hour).toBe(2)
  })
})

describe('buildThreeDayForecast', () => {
  function makeItem(
    dt: number,
    tempMin: number,
    tempMax: number,
    icon = '01d',
    description = 'ясно',
  ): OpenWeatherForecastItem {
    return {
      dt,
      main: { temp: tempMax, temp_min: tempMin, temp_max: tempMax },
      weather: [{ description, icon }],
    }
  }

  test('groups items by date and returns up to 3 days', () => {
    // 2024-01-15 at different hours (UTC)
    const day1_06 = makeItem(1705294800, 2, 5, '03d', 'облачно') // 06:00
    const day1_12 = makeItem(1705316400, 4, 8, '01d', 'ясно') // 12:00
    const day1_18 = makeItem(1705338000, 3, 7, '04d', 'пасмурно') // 18:00
    // 2024-01-16
    const day2_12 = makeItem(1705402800, 1, 3, '13d', 'снег') // 12:00
    // 2024-01-17
    const day3_12 = makeItem(1705489200, -2, 0, '09d', 'дождь') // 12:00
    // 2024-01-18 — should be excluded (only 3 days)
    const day4_12 = makeItem(1705575600, 5, 10, '01d', 'ясно') // 12:00

    const result = buildThreeDayForecast([
      day1_06,
      day1_12,
      day1_18,
      day2_12,
      day3_12,
      day4_12,
    ])

    expect(result).toHaveLength(3)
  })

  test('picks representative entry closest to noon', () => {
    const day_06 = makeItem(1705294800, 2, 5, '03d', 'облачно')
    const day_12 = makeItem(1705316400, 4, 8, '01d', 'ясно')
    const day_18 = makeItem(1705338000, 3, 7, '04d', 'пасмурно')

    const result = buildThreeDayForecast([day_06, day_12, day_18])

    expect(result[0].description).toBe('ясно')
    expect(result[0].icon).toBe('☀️')
  })

  test('computes correct min/max temperatures across entries', () => {
    const day_06 = makeItem(1705294800, 2, 5, '01d')
    const day_12 = makeItem(1705316400, 4, 8, '01d')
    const day_18 = makeItem(1705338000, 1, 10, '01d')

    const result = buildThreeDayForecast([day_06, day_12, day_18])

    expect(result[0].tempLow).toBe(1)
    expect(result[0].tempHigh).toBe(10)
  })

  test('returns empty array for empty input', () => {
    expect(buildThreeDayForecast([])).toEqual([])
  })

  test('applies timezone offset when grouping by date', () => {
    // Two items at 23:00 and 01:00 UTC — same UTC date but different local dates with +3h offset
    const lateNight = makeItem(1705359600, 2, 5, '01n', 'ночь') // 2024-01-15 23:00 UTC
    const earlyMorn = makeItem(1705366800, 3, 6, '01d', 'утро') // 2024-01-16 01:00 UTC

    // Without offset: both on same/adjacent UTC dates
    const withoutOffset = buildThreeDayForecast([lateNight, earlyMorn], 0)
    // With +3h offset: lateNight becomes 2024-01-16 02:00 local
    const withOffset = buildThreeDayForecast([lateNight, earlyMorn], 3 * 3600)

    // With offset, both should land on the same local date (Jan 16)
    expect(withOffset).toHaveLength(1)
    // Without offset they span two dates
    expect(withoutOffset).toHaveLength(2)
  })
})
