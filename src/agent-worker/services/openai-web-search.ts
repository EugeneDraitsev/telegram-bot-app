import { getErrorMessage, logger } from '@tg-bot/common'
import {
  OPENAI_WEB_SEARCH_MODEL,
  OPENAI_WEB_SEARCH_REASONING_EFFORT,
  OPENAI_WEB_SEARCH_TIMEOUT_MS,
} from '../agent/models'
import { getOpenAiClient } from './openai-client'
import { OPENAI_WEB_SEARCH_TOOLS } from './openai-tools'

export type WebSearchResponseFormat = 'brief' | 'detailed' | 'list'

export interface SearchWebOptions {
  groundedPrompt?: string
  fallbackQuery?: string
  chatId?: string | number
}

export const WEB_SEARCH_MODEL = OPENAI_WEB_SEARCH_MODEL

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ')
}

function buildSearchPrompt(
  query: string,
  format: WebSearchResponseFormat,
): string {
  const formatInstruction =
    format === 'brief'
      ? 'Return a short answer with the current value and source context.'
      : format === 'list'
        ? 'Return a concise bullet list with source context.'
        : 'Return a concise answer with the key facts and source context.'

  return [
    'Search the web before answering.',
    'Prefer current, reliable sources. If sources conflict, say so.',
    formatInstruction,
    `Query: ${query}`,
  ].join('\n')
}

export async function searchWebOpenAi(
  query: string,
  format: WebSearchResponseFormat = 'brief',
  options: SearchWebOptions = {},
): Promise<string> {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) {
    throw new Error('Search query cannot be empty')
  }

  const prompt = options.groundedPrompt?.trim()
    ? options.groundedPrompt.trim()
    : buildSearchPrompt(normalizedQuery, format)
  const loggedQuery = options.fallbackQuery?.trim() || normalizedQuery

  try {
    const response = await getOpenAiClient().responses.create(
      {
        model: WEB_SEARCH_MODEL,
        input: prompt,
        tools: OPENAI_WEB_SEARCH_TOOLS,
        tool_choice: 'auto',
        include: ['web_search_call.action.sources'],
        reasoning: { effort: OPENAI_WEB_SEARCH_REASONING_EFFORT },
        safety_identifier:
          options.chatId === undefined ? undefined : String(options.chatId),
        store: false,
        truncation: 'auto',
      },
      {
        timeout: OPENAI_WEB_SEARCH_TIMEOUT_MS + 1_000,
        maxRetries: 0,
      },
    )

    const text = response.output_text?.trim()
    if (!text) {
      throw new Error('OpenAI web search returned empty response')
    }

    logger.info(
      {
        query: loggedQuery,
        searchType: 'openai_web_search',
        model: WEB_SEARCH_MODEL,
      },
      'web_search.success',
    )
    return text
  } catch (error) {
    logger.error(
      {
        query: loggedQuery,
        searchType: 'openai_web_search',
        model: WEB_SEARCH_MODEL,
        error: getErrorMessage(error),
      },
      'web_search.failed',
    )
    throw new Error(`Web search unavailable: ${getErrorMessage(error)}`)
  }
}
