import { logger, type MetricsReport, renderSharpImage } from '@tg-bot/common'

export async function getMetricsDashboardImage(
  report: MetricsReport,
): Promise<Buffer | null> {
  try {
    return await renderSharpImage(
      { metricsReport: report },
      { customEndpoint: true },
    )
  } catch (error) {
    logger.warn({ error }, 'metrics.image_failed')
    return null
  }
}
