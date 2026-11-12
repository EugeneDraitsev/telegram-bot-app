import { fitsWidgetLimits, type WeatherData } from '@tg-bot/common'
import { buildWeatherWidgetHtml } from '../weather-widget'

const DESCRIPTIONS = [
  'небольшой проливной дождь с грозой',
  'переменная облачность с прояснениями',
  'сильный снегопад и метель',
  'туман, местами гололедица',
]

const makeWeather = (overrides: Partial<WeatherData> = {}): WeatherData => ({
  city: 'Минск',
  country: 'BY',
  countryFlag: '🇧🇾',
  temperature: -3,
  feelsLike: -8,
  humidity: 86,
  windSpeed: 4,
  windDirection: 'СЗ',
  description: 'небольшой снег',
  icon: '🌨',
  hourly: Array.from({ length: 8 }, (_, index) => ({
    hour: (15 + index * 3) % 24,
    temperature: -6 + index,
    description: DESCRIPTIONS[index % DESCRIPTIONS.length],
    icon: '🌨',
    precipitationChance: index * 13,
  })),
  forecast: [
    { tempHigh: 1, tempLow: -6, description: 'снег', icon: '🌨' },
    { tempHigh: 3, tempLow: -2, description: 'облачно', icon: '☁️' },
    { tempHigh: 6, tempLow: 0, description: 'ясно', icon: '☀️' },
  ],
  ...overrides,
})

describe('weather widget', () => {
  test('stays within the Telegram widget size limits', () => {
    const html = buildWeatherWidgetHtml(
      makeWeather({
        city: 'Сан-Висенти-ди-Алкантара-и-Сан-Жуан-ду-Мансу',
        description: 'очень длинное описание погоды '.repeat(4),
      }),
    )

    expect(fitsWidgetLimits(html)).toBe(true)
  })

  test('shows the current weather, the hourly bars and the forecast', () => {
    const html = buildWeatherWidgetHtml(makeWeather())

    expect(html).toContain('<div class="ct">Минск<small>BY</small></div>')
    expect(html).toContain('<b id="t">−3</b>°')
    expect(html).toContain('Небольшой снег')
    expect(html).toContain('Ощущается как −8°')
    expect(html).toContain('<b>91%</b><small>осадки за сутки</small>')
    // −6°…1° is padded to an 8° span, so the bars run 15px to 57px.
    expect(html).toContain('<b>−6°</b><i id="c0" style="height:15px">')
    expect(html).toContain('<b>1°</b><i id="c7" style="height:57px">')
    expect(html).toContain('<small>15:00</small>')
    // The first hour starts highlighted, with its details above the bars.
    expect(html).toContain(
      '<div id="tip">15:00 · небольшой проливной дождь с грозой</div>',
    )
    expect(html).toContain('<div class="h on" data-i="0">')
    expect(html).toContain('<div class="h" data-i="1">')
    expect(html).toContain('"00:00 · туман, местами гололедица · ☔ 39%"')
    expect(html).toContain('Послезавтра')
    // The first day spans −6°…1° of −6°…6°, with a marker at −3°.
    expect(html).toContain('<i id="g0" style="left:0%;width:58%"></i>')
    expect(html).toContain('<b style="left:25%"></b>')
  })

  test('keeps bars close in height when the temperature barely changes', () => {
    const steady = makeWeather().hourly.map((slot, index) => ({
      ...slot,
      temperature: index % 2 ? 3 : 1,
    }))

    const html = buildWeatherWidgetHtml(makeWeather({ hourly: steady }))

    expect(html).toContain('<b>1°</b><i id="c0" style="height:30px">')
    expect(html).toContain('<b>3°</b><i id="c1" style="height:42px">')
  })

  test('escapes text from the weather API', () => {
    const html = buildWeatherWidgetHtml(
      makeWeather({
        city: '<img src=x>',
        hourly: [
          {
            hour: 9,
            temperature: 5,
            description: '</script><b>',
            icon: '☀️',
            precipitationChance: 0,
          },
        ],
      }),
    )

    expect(html).toContain('&lt;img src=x&gt;')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('</script><b>')
  })

  test('omits the hourly card when the forecast is missing', () => {
    const html = buildWeatherWidgetHtml(makeWeather({ hourly: [] }))

    expect(html).not.toContain('id="hrs"')
    expect(html).toContain('const D=[],N=-3,G=3')
  })
})
