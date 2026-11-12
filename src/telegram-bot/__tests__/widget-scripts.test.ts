import {
  buildMetricsReport,
  type MetricEntry,
  type UserStat,
  type WeatherData,
} from '@tg-bot/common'
import { buildWeatherWidgetHtml } from '../external-apis/weather-widget'
import { buildMetricsWidgetHtml } from '../users/metrics-widget'
import { buildStatisticsWidgetHtml } from '../users/statistics-widget'

const NOW = Date.UTC(2026, 10, 12, 12)

interface FakeElement {
  textContent: string
  innerHTML: string
  className: string
  disabled: boolean
  style: Record<string, string>
  dataset: Record<string, string>
  firstChild: FakeElement
  animate: () => void
  addEventListener: (type: string, listener: (event: unknown) => void) => void
}

/**
 * Runs a widget's script against a stand-in DOM, the way Telegram does when
 * the widget comes on screen, then fires every click handler it registered.
 * Returns the ids of the elements the script animated.
 */
function runWidgetScript(html: string): string[] {
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1] ?? ''
  const elements = new Map<string, FakeElement>()
  const listeners: Array<{ id: string; listener: (event: unknown) => void }> =
    []
  const animated: string[] = []

  const getElement = (id: string): FakeElement => {
    const existing = elements.get(id)
    if (existing) return existing

    const element: FakeElement = {
      textContent: '0',
      innerHTML: '',
      className: '',
      disabled: false,
      style: {},
      // Tapped elements carry the index of the bar or column they stand for.
      dataset: { i: '0' },
      get firstChild() {
        return getElement(`${id}>first`)
      },
      animate: () => {
        animated.push(id)
      },
      addEventListener: (_type, listener) => {
        listeners.push({ id, listener })
      },
    }
    elements.set(id, element)
    return element
  }

  new Function(
    'document',
    'window',
    'matchMedia',
    'requestAnimationFrame',
    script,
  )(
    { getElementById: getElement },
    {},
    () => ({ matches: false }),
    () => {},
  )
  for (const { id, listener } of listeners) {
    listener({ target: getElement(id) })
  }

  return animated
}

const users = [500, 200, 100, 80, 50, 30, 20, 8, 4, 3, 3, 2].map(
  (msgCount, index): UserStat => ({
    id: index,
    msgCount,
    username: `user${index}`,
  }),
)

const weather: WeatherData = {
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
    description: 'снег',
    icon: '🌨',
    precipitationChance: index * 10,
  })),
  forecast: [
    { tempHigh: 1, tempLow: -6, description: 'снег', icon: '🌨' },
    { tempHigh: 3, tempLow: -2, description: 'облачно', icon: '☁️' },
  ],
}

const metricsReport = buildMetricsReport(
  Array.from(
    { length: 40 },
    (_, index): MetricEntry => ({
      type: index % 2 ? 'tool_call' : 'model_call',
      source: 'agentic',
      name: `operation_${index % 3}`,
      model: 'openai/gpt-6-luna',
      chatId: 1,
      durationMs: 1_000 + index,
      success: index % 5 > 0,
      status: index % 5 ? 'success' : 'timeout',
      timestamp: NOW - index * 30 * 60 * 1000,
    }),
  ),
  24,
  NOW,
)

// The HTML tests cannot see a script that parses but throws when it runs,
// such as a statement that a following "[" or "(" line silently continues.
describe('widget scripts', () => {
  test('the statistics script draws the rows, plays the intro and pages', () => {
    const animated = runWidgetScript(buildStatisticsWidgetHtml(users))

    // The podium rises from third place to first, then the row bars grow.
    expect(animated.slice(0, 3)).toEqual(['s2', 's1', 's0'])
    expect(animated).toContain('g0')
    // Paging forward slides the next rows in.
    expect(animated).toContain('r0')
  })

  test('the statistics script runs for a chat with a single user', () => {
    expect(
      runWidgetScript(buildStatisticsWidgetHtml(users.slice(0, 1))),
    ).toEqual(['s2', 's1', 's0'])
  })

  test('the weather script plays the intro and handles a tap on an hour', () => {
    const animated = runWidgetScript(buildWeatherWidgetHtml(weather))

    expect(animated).toEqual(
      expect.arrayContaining(['ic', 'c0', 'c7', 'g0', 'g1']),
    )
    // The tap bounces the bar and slides the new tip in.
    expect(animated).toContain('tip')
  })

  test('the weather script runs without an hourly forecast', () => {
    const animated = runWidgetScript(
      buildWeatherWidgetHtml({ ...weather, hourly: [] }),
    )

    expect(animated).toEqual(expect.arrayContaining(['ic', 'g0']))
  })

  test('the metrics script draws the bars, plays the intro and switches tabs', () => {
    const animated = runWidgetScript(buildMetricsWidgetHtml(metricsReport))

    expect(animated).toEqual(expect.arrayContaining(['c0', 'c23', 'tip']))
  })
})
