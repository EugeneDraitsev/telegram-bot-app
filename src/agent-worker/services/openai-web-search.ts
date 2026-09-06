import { generateText, type ToolSet } from 'ai'

import {
  getAiSdkGoogleTools,
  getAiSdkLanguageModel,
  getAiSdkOpenAiTools,
  getErrorMessage,
  logger,
} from '@tg-bot/common'
import {
  getModelProviderOptions,
  type ModelChoice,
  WEB_SEARCH_ROLE,
} from '../agent/models'

export type WebSearchResponseFormat = 'brief' | 'detailed' | 'list'

export interface SearchWebOptions {
  groundedPrompt?: string
  fallbackQuery?: string
  chatId?: string | number
}

function getProviderTools(choice: ModelChoice): ToolSet {
  if (choice.config.provider === 'google') {
    return {
      google_search: getAiSdkGoogleTools().googleSearch({}),
    }
  }

  return {
    web_search: getAiSdkOpenAiTools().webSearch({ searchContextSize: 'high' }),
  }
}

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
  choice: ModelChoice = WEB_SEARCH_ROLE.primary,
): Promise<string> {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) {
    throw new Error('Search query cannot be empty')
  }

  const prompt = options.groundedPrompt?.trim()
    ? options.groundedPrompt.trim()
    : buildSearchPrompt(normalizedQuery, format)
  const loggedQuery = options.fallbackQuery?.trim() || normalizedQuery
  const searchType = `${choice.config.provider}_web_search`

  try {
    const response = await generateText({
      model: getAiSdkLanguageModel(choice.config),
      prompt,
      tools: getProviderTools(choice),
      toolChoice: 'auto',
      maxRetries: 0,
      timeout: WEB_SEARCH_ROLE.timeoutMs,
      providerOptions: getModelProviderOptions(choice, {
        chatId: options.chatId,
        truncation: 'auto',
      }),
    })

    const text = response.text?.trim()
    if (!text) {
      throw new Error(
        `Web search model ${choice.label} returned empty response`,
      )
    }

    logger.info(
      {
        query: loggedQuery,
        searchType,
        model: choice.config.model,
      },
      'web_search.success',
    )
    return text
  } catch (error) {
    logger.error(
      {
        query: loggedQuery,
        searchType,
        model: choice.config.model,
        error: getErrorMessage(error),
      },
      'web_search.failed',
    )
    throw new Error(`Web search unavailable: ${getErrorMessage(error)}`)
  }
}
