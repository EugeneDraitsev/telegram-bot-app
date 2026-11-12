import {
  buildMetricsReport,
  fitsWidgetLimits,
  formatMetricsCaption,
  type MetricEntry,
} from '@tg-bot/common'
import { buildMetricsWidgetHtml } from '../metrics-widget'

const NOW = Date.UTC(2026, 10, 12, 12)
const HOUR = 60 * 60 * 1000
const STATUSES = ['success', 'success', 'success', 'timeout', 'error'] as const

function entry(index: number, overrides: Partial<MetricEntry> = {}) {
  const status = STATUSES[index % STATUSES.length]
  return {
    type: index % 2 ? 'tool_call' : 'model_call',
    source: index % 3 ? 'agentic' : 'command',
    name: `operation_with_a_rather_long_name_${index % 12}`,
    model: `google/gemini-model-variant-${index % 12}-preview`,
    command: `command${index % 12}`,
    fallbackFrom: index % 7 ? undefined : 'openai/gpt-fallback',
    chatId: 1,
    durationMs: 100 + ((index * 997) % 30_000),
    success: status === 'success',
    status,
    timestamp: NOW - ((index * 7919) % (720 * HOUR)),
    ...overrides,
  } satisfies MetricEntry
}

const worstCaseReport = buildMetricsReport(
  Array.from({ length: 5_000 }, (_, index) => entry(index)),
  720,
  NOW,
)

describe('metrics widget', () => {
  test('stays within the Telegram widget size limits for a busy month', () => {
    const html = buildMetricsWidgetHtml(worstCaseReport)

    expect(fitsWidgetLimits(html)).toBe(true)
    expect(html).not.toContain('\0')
  })

  test('escapes labels and omits empty tabs', () => {
    const html = buildMetricsWidgetHtml(
      buildMetricsReport(
        [
          entry(0, {
            type: 'tool_call',
            source: 'agentic',
            name: '<script>alert(1)</script>',
            timestamp: NOW - HOUR,
          }),
        ],
        24,
        NOW,
      ),
    )

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('id="bt"')
    expect(html).not.toContain('id="bm"')
    expect(html).not.toContain('id="bc"')
    expect(html).toContain('const K=["t"]')
  })

  test('summarizes the report in one line for the PNG caption', () => {
    expect(formatMetricsCaption(worstCaseReport)).toMatch(
      /^AI operations · last 720h · \d+(\.\d)?% healthy · \d+ ops$/,
    )
  })

  test.each([
    [24, 'ops per hour'],
    [35, 'ops per 87.5 min'],
    [168, 'ops per 7h'],
  ])('labels %ih buckets with their real duration', (hours, unit) => {
    const report = buildMetricsReport([entry(0)], hours, NOW)

    expect(buildMetricsWidgetHtml(report)).toContain(`<small>${unit}</small>`)
  })
})
