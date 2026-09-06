import { getErrorMessage, logger, type MetricSource } from '@tg-bot/common'
import { WEB_SEARCH_ROLE } from '../agent/models'
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
  const { primary, fallback } = WEB_SEARCH_ROLE

  try {
    return await trackToolModelCall(
      { name, model: primary.label, attribution: tracking.attribution },
      () => search(query, format, options, primary),
    )
  } catch (error) {
    logger.warn(
      {
        primaryModel: primary.label,
        fallbackModel: fallback.label,
        error: getErrorMessage(error),
      },
      'web_search.fallback_invoked',
    )

    return trackToolModelCall(
      {
        name,
        model: fallback.label,
        fallbackFrom: primary.label,
        attribution: tracking.attribution,
      },
      () => search(query, format, options, fallback),
    )
  }
}
