import sharp from 'sharp'

import {
  buildMetricsReport,
  formatMetricsReport,
  type MetricEntry,
} from '@tg-bot/common'
import { getMetricsDashboardSvg } from '../metrics-dashboard.component'

const NOW = Date.UTC(2026, 6, 30, 12)

function metric(
  overrides: Partial<MetricEntry> & Pick<MetricEntry, 'type' | 'name'>,
): MetricEntry {
  return {
    source: 'agentic',
    chatId: 1,
    durationMs: 1000,
    success: true,
    status: 'success',
    timestamp: NOW - 60 * 60 * 1000,
    ...overrides,
  }
}

describe('getMetricsDashboardSvg', () => {
  test('keeps every model, including a rarely used Sunburst, in the report and image', async () => {
    const models = [
      ...Array.from({ length: 10 }, (_, index) => `openai/test-model-${index}`),
      'google/gemini-3.1-flash-lite-image',
      'openai/gpt-image-2.5-sunburst',
    ]
    const report = buildMetricsReport(
      models.flatMap((model, index) =>
        Array.from({ length: models.length - index }, () =>
          metric({ type: 'model_call', name: 'image_generation', model }),
        ),
      ),
      24,
      NOW,
    )
    const svg = getMetricsDashboardSvg(report)
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    const metadata = await sharp(png).metadata()

    expect(report.models.map(({ label }) => label)).toEqual(models)
    for (const model of models) expect(svg).toContain(model)
    expect(formatMetricsReport(report)).toContain('gpt-image-2.5-sunburst')
    expect(metadata.width).toBe(1200)
    expect(metadata.height).toBeGreaterThan(980)
    // The final row and footer must both stay inside the expanded canvas.
    const textPositions = [...svg.matchAll(/<text\b[^>]*\by="([\d.]+)"/g)].map(
      (match) => Number(match[1]),
    )
    expect(Math.max(...textPositions)).toBeLessThan(metadata.height ?? 0)
  })

  test('renders a readable 1200x980 PNG dashboard', async () => {
    const report = buildMetricsReport(
      [
        metric({
          type: 'model_call',
          name: 'routing',
          model: 'google/gemini-3.6-flash',
          durationMs: 6300,
        }),
        metric({
          type: 'model_call',
          name: 'image_generation',
          model: 'google/gemini-3.1-flash-lite-image',
          durationMs: 9700,
        }),
        metric({
          type: 'tool_call',
          name: 'generate_or_edit_image',
          durationMs: 9800,
        }),
        metric({
          type: 'model_call',
          source: 'command',
          command: 'o',
          name: 'finalize',
          model: 'openai/gpt-5.6',
          durationMs: 20_000,
          success: false,
          status: 'timeout',
        }),
      ],
      24,
      NOW,
    )
    const svg = getMetricsDashboardSvg(report)
    const image = await sharp(Buffer.from(svg)).png().toBuffer()
    const metadata = await sharp(image).metadata()

    expect(svg).toContain('AI OPERATIONS')
    expect(svg).toContain('generate_or_edit_image')
    expect(svg).toContain('google/gemini-3.1')
    expect(metadata.format).toBe('png')
    expect(metadata.width).toBe(1200)
    expect(metadata.height).toBe(980)
  })
})
