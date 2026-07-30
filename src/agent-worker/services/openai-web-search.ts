import { generateText, type ToolSet } from 'ai'

import {
  type AiModelConfig,
  formatAiModelConfig,
  getAiSdkGoogleTools,
  getAiSdkLanguageModel,
  getAiSdkOpenAiTools,
  getAiSdkProviderOptions,
  getErrorMessage,
  logger,
} from '@tg-bot/common'
import {
  OPENAI_WEB_SEARCH_REASONING_EFFORT,
  WEB_SEARCH_ATTEMPT_TIMEOUT_MS,
  WEB_SEARCH_MODEL_CONFIG,
} from '../agent/models'

export type WebSearchResponseFormat = 'brief' | 'detailed' | 'list'

export interface SearchWebOptions {
  groundedPrompt?: string
  fallbackQuery?: string
  chatId?: string | number
}

function getProviderTools(modelConfig: AiModelConfig): ToolSet {
  if (modelConfig.provider === 'google') {
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
  modelConfig: AiModelConfig = WEB_SEARCH_MODEL_CONFIG,
): Promise<string> {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) {
    throw new Error('Search query cannot be empty')
  }

  const prompt = options.groundedPrompt?.trim()
    ? options.groundedPrompt.trim()
    : buildSearchPrompt(normalizedQuery, format)
  const loggedQuery = options.fallbackQuery?.trim() || normalizedQuery
  const modelLabel = formatAiModelConfig(modelConfig)
  const searchType = `${modelConfig.provider}_web_search`

  try {
    const response = await generateText({
      model: getAiSdkLanguageModel(modelConfig),
      prompt,
      tools: getProviderTools(modelConfig),
      toolChoice: 'auto',
      maxRetries: 0,
      timeout: WEB_SEARCH_ATTEMPT_TIMEOUT_MS,
      providerOptions: getAiSdkProviderOptions(modelConfig, {
        reasoningEffort: OPENAI_WEB_SEARCH_REASONING_EFFORT,
        chatId: options.chatId,
        store: false,
        truncation: 'auto',
        serviceTier: modelConfig.provider === 'google' ? 'priority' : undefined,
      }),
    })

    const text = response.text?.trim()
    if (!text) {
      throw new Error(`Web search model ${modelLabel} returned empty response`)
    }

    logger.info(
      {
        query: loggedQuery,
        searchType,
        model: modelConfig.model,
      },
      'web_search.success',
    )
    return text
  } catch (error) {
    logger.error(
      {
        query: loggedQuery,
        searchType,
        model: modelConfig.model,
        error: getErrorMessage(error),
      },
      'web_search.failed',
    )
    throw new Error(`Web search unavailable: ${getErrorMessage(error)}`)
  }
}
