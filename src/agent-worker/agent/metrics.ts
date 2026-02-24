/**
 * Agent-specific metrics — adds logging on top of the shared metrics module.
 */

import { recordMetric, timedCall } from '@tg-bot/common'
import { logger } from '../logger'

export { recordMetric, timedCall }

/** Time a model call with logging + Redis metrics */
export async function timedModelCall<T>(
  name: string,
  model: string,
  chatId: number,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    const durationMs = Date.now() - start
    logger.info(
      { chatId, metricType: 'model_call', name, model, durationMs },
      'metric',
    )
    void recordMetric({
      type: 'model_call',
      source: 'agentic',
      name,
      model,
      chatId,
      durationMs,
      success: true,
      timestamp: Date.now(),
    })
    return result
  } catch (error) {
    const durationMs = Date.now() - start
    logger.info(
      {
        chatId,
        metricType: 'model_call',
        name,
        model,
        durationMs,
        success: false,
      },
      'metric',
    )
    void recordMetric({
      type: 'model_call',
      source: 'agentic',
      name,
      model,
      chatId,
      durationMs,
      success: false,
      timestamp: Date.now(),
    })
    throw error
  }
}
