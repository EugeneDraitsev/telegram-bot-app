import {
  getRequiredEnv,
  invokeLambda,
  logger,
  type MetricsReport,
  safeJSONParse,
} from '@tg-bot/common'

export async function getMetricsDashboardImage(
  report: MetricsReport,
): Promise<Buffer | null> {
  try {
    const response = await invokeLambda({
      name: getRequiredEnv('SHARP_RENDERER_FUNCTION_NAME'),
      customEndpoint: true,
      payload: { metricsReport: report },
    })

    if (response.FunctionError) {
      logger.warn(
        { error: response.FunctionError },
        'metrics.image_function_error',
      )
      return null
    }

    const payload = safeJSONParse(new TextDecoder().decode(response.Payload))
    if (payload?.statusCode !== 200 || typeof payload.body !== 'string') {
      logger.warn(
        { statusCode: payload?.statusCode, error: payload?.body },
        'metrics.image_render_failed',
      )
      return null
    }

    const image = Buffer.from(payload.body, 'base64')
    return image.byteLength ? image : null
  } catch (error) {
    logger.warn({ error }, 'metrics.image_failed')
    return null
  }
}
