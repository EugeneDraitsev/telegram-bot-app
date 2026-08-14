import {
  formatAiModelConfig,
  getErrorMessage,
  isSameAiModel,
  logger,
  type MetricSource,
} from '@tg-bot/common'
import {
  WEB_SEARCH_FALLBACK_MODEL_CONFIG,
  WEB_SEARCH_MODEL_CONFIG,
} from '../agent/models'
import {
  type SearchWebOptions,
  searchWebOpenAi,
  type WebSearchResponseFormat,
} from '../services/openai-web-search'
import { trackToolModelCall } from './context'

export interface WebSearchTrackingOptions {
  name?: string
  attribution?: { source: MetricSource; command?: string }
}

type SearchWebAttempt = typeof searchWebOpenAi

export async function searchWebWithFallback(
  query: string,
  format: WebSearchResponseFormat = 'brief',
  options: SearchWebOptions = {},
  tracking: WebSearchTrackingOptions = {},
  search: SearchWebAttempt = searchWebOpenAi,
): Promise<string> {
  const name = tracking.name ?? 'web_search'
  const primaryModel = formatAiModelConfig(WEB_SEARCH_MODEL_CONFIG)

  try {
    return await trackToolModelCall(
      { name, model: primaryModel, attribution: tracking.attribution },
      () => search(query, format, options, WEB_SEARCH_MODEL_CONFIG),
    )
  } catch (error) {
    if (
      isSameAiModel(WEB_SEARCH_MODEL_CONFIG, WEB_SEARCH_FALLBACK_MODEL_CONFIG)
    ) {
      throw error
    }

    const fallbackModel = formatAiModelConfig(WEB_SEARCH_FALLBACK_MODEL_CONFIG)
    logger.warn(
      {
        primaryModel,
        fallbackModel,
        error: getErrorMessage(error),
      },
      'web_search.fallback_invoked',
    )

    return trackToolModelCall(
      {
        name,
        model: fallbackModel,
        fallbackFrom: primaryModel,
        attribution: tracking.attribution,
      },
      () => search(query, format, options, WEB_SEARCH_FALLBACK_MODEL_CONFIG),
    )
  }
}
