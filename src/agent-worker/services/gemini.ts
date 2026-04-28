/**
 * Google Gemini AI for image and voice generation.
 * Text generation for the main loop is now in agentic-loop.ts via @google/genai directly.
 * This file keeps specialized generation functions that tools still need.
 */

import { GoogleGenAI } from '@google/genai'
import type { ServiceTier } from '@google/genai'

import { GEMINI_SERVICE_TIER, getErrorMessage, logger } from '@tg-bot/common'
import {
  SEARCH_MODEL_FALLBACK,
  SEARCH_MODEL_PRIMARY,
} from '../agent/model-constants'
import { withTimeout } from '../agent/utils'

type WebSearchResponseFormat = 'brief' | 'detailed' | 'list'
type WebSearchType =
  | 'gemini_google_search_primary'
  | 'gemini_google_search_fallback'
  | 'tavily'
  | 'google_custom_search'

interface SearchWebOptions {
  groundedPrompt?: string
  fallbackQuery?: string
}

interface CustomSearchItem {
  title?: string
  link?: string
  displayLink?: string
  snippet?: string
}

interface CustomSearchResponse {
  items?: CustomSearchItem[]
  error?: {
    message?: string
  }
}

interface TavilySearchResult {
  title?: string
  url?: string
  content?: string
  score?: number
}

interface TavilySearchResponse {
  answer?: string
  results?: TavilySearchResult[]
  error?: string
}

const GROUNDED_SEARCH_TIMEOUT_MS = 6_000
const TAVILY_SEARCH_TIMEOUT_MS = 5_000
const CUSTOM_SEARCH_TIMEOUT_MS = 5_000
const CUSTOM_SEARCH_RESULT_LIMIT = 5

const SEARCH_MODELS = [SEARCH_MODEL_PRIMARY, SEARCH_MODEL_FALLBACK] as const
let aiClient: GoogleGenAI | undefined
let aiClientApiKey = ''

function getGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY || ''
}

function getTavilyApiKey(): string {
  return process.env.TAVILY_API_KEY || ''
}

function getCustomSearchCredentials(): {
  googleApiKey: string
  cxToken: string
} {
  return {
    googleApiKey: process.env.COMMON_GOOGLE_API_KEY || '',
    cxToken: process.env.GOOGLE_CX_TOKEN || '',
  }
}

function getAi(): GoogleGenAI {
  const currentApiKey = getGeminiApiKey()
  if (!currentApiKey) {
    throw new Error('Gemini API key not configured')
  }

  if (!aiClient || aiClientApiKey !== currentApiKey) {
    aiClient = new GoogleGenAI({ apiKey: currentApiKey })
    aiClientApiKey = currentApiKey
  }

  return aiClient
}

function normalizeQuery(query: string): string {
  return query.trim()
}

function buildSearchPrompt(
  query: string,
  format: WebSearchResponseFormat,
): string {
  const formatInstructions: Record<WebSearchResponseFormat, string> = {
    brief: 'Answer briefly in 1-2 sentences.',
    detailed:
      'Answer concisely with key facts. Use markdown formatting (bold for key numbers, bullet points for lists). Keep it under 500 characters - this is a Telegram chat.',
    list: 'Answer as a concise bullet list.',
  }

  return [
    'Use fresh web information from Google Search.',
    `Query: ${query}`,
    'If the query names a specific product, model, company, or person, verify that exact name first.',
    'If the exact name is not confirmed by search results, say that clearly instead of substituting a more familiar match as a fact.',
    formatInstructions[format],
    'Answer in the same language as the query.',
  ].join('\n')
}

function extractPromptQuery(promptOrQuery: string): string {
  const explicitQuery = promptOrQuery.match(/(?:^|\n)\s*Query:\s*(.+)$/im)?.[1]
  return explicitQuery?.trim() || promptOrQuery.trim()
}

function looksLikeGroundedPrompt(input: string): boolean {
  const normalized = input.trim()
  if (!normalized.includes('\n')) {
    return false
  }

  return (
    /(?:^|\n)\s*query:\s*\S/im.test(normalized) &&
    (normalized.includes('Use fresh web information from Google Search.') ||
      normalized.includes('Answer in the same language as the query.') ||
      normalized.includes(
        'If the query names a specific product, model, company, or person, verify that exact name first.',
      ))
  )
}

function normalizeSnippet(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function getResultLimit(format: WebSearchResponseFormat): number {
  return format === 'brief'
    ? 2
    : format === 'detailed'
      ? 4
      : CUSTOM_SEARCH_RESULT_LIMIT
}

function formatCustomSearchItem(item: CustomSearchItem): string {
  const title = normalizeSnippet(item.title) || 'Untitled'
  const host = normalizeSnippet(item.displayLink)
  const snippet = normalizeSnippet(item.snippet)
  const url = normalizeSnippet(item.link)
  const lines = [host ? `- ${title} (${host})` : `- ${title}`]

  if (snippet) {
    lines.push(`  ${snippet}`)
  }

  if (url) {
    lines.push(`  URL: ${url}`)
  }

  return lines.join('\n')
}

function formatCustomSearchResults(
  query: string,
  items: CustomSearchItem[],
  format: WebSearchResponseFormat,
): string {
  const results = items
    .filter((item) => normalizeSnippet(item.link))
    .slice(0, getResultLimit(format))
    .map(formatCustomSearchItem)

  if (results.length === 0) {
    throw new Error(`No usable web results found for: ${query}`)
  }

  return [`Fresh web results for "${query}":`, ...results].join('\n')
}

function getCustomSearchUrl(
  query: string,
  credentials: { googleApiKey: string; cxToken: string },
): string {
  const params = new URLSearchParams({
    key: credentials.googleApiKey,
    cx: credentials.cxToken,
    q: query,
    num: String(CUSTOM_SEARCH_RESULT_LIMIT),
    filter: '1',
    safe: 'off',
  })

  return `https://www.googleapis.com/customsearch/v1?${params.toString()}`
}

function formatTavilySearchItem(item: TavilySearchResult): string {
  const title = normalizeSnippet(item.title) || 'Untitled'
  const snippet = normalizeSnippet(item.content)
  const url = normalizeSnippet(item.url)
  const score =
    typeof item.score === 'number' ? ` [score ${item.score.toFixed(2)}]` : ''
  const lines = [`- ${title}${score}`]

  if (snippet) {
    lines.push(`  ${snippet}`)
  }

  if (url) {
    lines.push(`  URL: ${url}`)
  }

  return lines.join('\n')
}

function formatTavilySearchResults(
  query: string,
  response: TavilySearchResponse,
  format: WebSearchResponseFormat,
): string {
  const answer = normalizeSnippet(response.answer)
  const results = (response.results ?? [])
    .filter((item) => normalizeSnippet(item.url))
    .slice(0, getResultLimit(format))
    .map(formatTavilySearchItem)

  if (!answer && results.length === 0) {
    throw new Error(`No Tavily results found for: ${query}`)
  }

  const lines = [`Fresh web results for "${query}" via Tavily:`]

  if (answer) {
    lines.push(answer)
  }

  if (results.length > 0) {
    lines.push(...results)
  }

  return lines.join('\n')
}

function isTimeoutLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    error.name.toLowerCase().includes('timeout') ||
    message.includes('timed out') ||
    message.includes('timeout')
  )
}

function getGroundedSearchType(model: string): WebSearchType {
  return model === SEARCH_MODEL_PRIMARY
    ? 'gemini_google_search_primary'
    : 'gemini_google_search_fallback'
}

async function runGroundedSearch(
  model: string,
  prompt: string,
): Promise<string> {
  const response = await withTimeout(
    getAi().models.generateContent({
      model,
      contents: prompt,
      config: {
        serviceTier: GEMINI_SERVICE_TIER as ServiceTier,
        tools: [{ googleSearch: {} }],
      },
    }),
    GROUNDED_SEARCH_TIMEOUT_MS,
    new Error(
      `Grounded web search timed out after ${GROUNDED_SEARCH_TIMEOUT_MS}ms`,
    ),
  )

  const text = response.text?.trim()
  if (!text) {
    throw new Error('Empty response from grounded web search')
  }

  return cleanResponse(text)
}

async function searchWebWithTavily(
  query: string,
  format: WebSearchResponseFormat,
): Promise<string> {
  const tavilyApiKey = getTavilyApiKey()
  if (!tavilyApiKey) {
    throw new Error('Tavily fallback is not configured')
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tavilyApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      topic: 'general',
      search_depth: 'fast',
      max_results: getResultLimit(format),
      include_answer: format !== 'list' ? 'basic' : false,
      include_raw_content: false,
      include_images: false,
      include_favicon: false,
    }),
    signal: AbortSignal.timeout(TAVILY_SEARCH_TIMEOUT_MS),
  })

  const data = (await response.json()) as TavilySearchResponse
  if (!response.ok) {
    throw new Error(
      normalizeSnippet(data.error) || `Tavily API error: ${response.status}`,
    )
  }

  return formatTavilySearchResults(query, data, format)
}

async function searchWebWithCustomSearch(
  query: string,
  format: WebSearchResponseFormat,
): Promise<string> {
  const credentials = getCustomSearchCredentials()
  if (!credentials.googleApiKey || !credentials.cxToken) {
    throw new Error('Google Custom Search fallback is not configured')
  }

  const response = await fetch(getCustomSearchUrl(query, credentials), {
    signal: AbortSignal.timeout(CUSTOM_SEARCH_TIMEOUT_MS),
  })

  const data = (await response.json()) as CustomSearchResponse
  if (!response.ok) {
    const message =
      normalizeSnippet(data.error?.message) ||
      `Google API error: ${response.status}`
    throw new Error(message)
  }

  const items = data.items ?? []
  if (!items.length) {
    throw new Error(`No web results found for: ${query}`)
  }

  return formatCustomSearchResults(query, items, format)
}

/**
 * Search the web using grounded Google Search via Gemini.
 */
export async function searchWeb(
  query: string,
  format: WebSearchResponseFormat = 'brief',
  options: SearchWebOptions = {},
): Promise<string> {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) {
    throw new Error('Search query cannot be empty')
  }

  const explicitGroundedPrompt = options.groundedPrompt?.trim()
  const groundedPrompt =
    explicitGroundedPrompt ||
    (looksLikeGroundedPrompt(normalizedQuery)
      ? normalizedQuery
      : buildSearchPrompt(normalizedQuery, format))
  const fallbackQuery =
    options.fallbackQuery?.trim() ||
    extractPromptQuery(explicitGroundedPrompt || normalizedQuery)
  const geminiApiKey = getGeminiApiKey()
  const tavilyApiKey = getTavilyApiKey()
  const customSearchCredentials = getCustomSearchCredentials()

  if (
    !geminiApiKey &&
    !tavilyApiKey &&
    (!customSearchCredentials.googleApiKey || !customSearchCredentials.cxToken)
  ) {
    throw new Error('No web search provider is configured')
  }

  let groundedError: unknown
  if (geminiApiKey) {
    for (const model of SEARCH_MODELS) {
      try {
        const text = await runGroundedSearch(model, groundedPrompt)
        const searchType = getGroundedSearchType(model)
        logger.info(
          {
            query: fallbackQuery,
            searchType,
            model,
          },
          'web_search.success',
        )
        return text
      } catch (error) {
        groundedError = error
        logger.warn(
          {
            query: fallbackQuery,
            searchType: getGroundedSearchType(model),
            model,
            error: getErrorMessage(error),
            timeoutLike: isTimeoutLikeError(error),
          },
          'web_search.grounded_attempt_failed',
        )
      }
    }
    logger.warn(
      {
        query: fallbackQuery,
        searchType: 'gemini_google_search_fallback',
        error: groundedError && getErrorMessage(groundedError),
        timeoutLike: isTimeoutLikeError(groundedError),
      },
      'web_search.grounded_failed_fallback_to_external',
    )
  }

  if (tavilyApiKey) {
    try {
      const tavilyResults = await searchWebWithTavily(fallbackQuery, format)
      logger.info(
        { query: fallbackQuery, searchType: 'tavily' },
        'web_search.success',
      )
      return tavilyResults
    } catch (tavilyError) {
      logger.warn(
        {
          query: fallbackQuery,
          searchType: 'tavily',
          error: getErrorMessage(tavilyError),
          timeoutLike: isTimeoutLikeError(tavilyError),
        },
        'web_search.tavily_failed_fallback_to_custom',
      )
    }
  }

  try {
    const fallbackResults = await searchWebWithCustomSearch(
      fallbackQuery,
      format,
    )
    logger.info(
      { query: fallbackQuery, searchType: 'google_custom_search' },
      'web_search.success',
    )
    return fallbackResults
  } catch (fallbackError) {
    logger.error(
      {
        query: fallbackQuery,
        searchType: 'google_custom_search',
        groundedError: groundedError && getErrorMessage(groundedError),
        tavilyConfigured: Boolean(tavilyApiKey),
        fallbackError: getErrorMessage(fallbackError),
      },
      'web_search.failed',
    )
    throw new Error(`Web search unavailable: ${getErrorMessage(fallbackError)}`)
  }
}

/**
 * Generate image with optional text response.
 * Uses the Interactions API with gemini-3.1-flash-image-preview.
 */
export async function generateImage(
  prompt: string,
  inputImages?: Buffer[],
): Promise<{ image?: Buffer; text?: string }> {
  if (!getGeminiApiKey()) {
    throw new Error('Gemini API key not configured')
  }

  const input: Array<{
    role: 'user'
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'image'; data: string; mime_type: 'image/jpeg' }
    >
  }> = []

  if (inputImages?.length) {
    for (const image of inputImages) {
      input.push({
        role: 'user',
        content: [
          {
            type: 'image',
            data: image.toString('base64'),
            mime_type: 'image/jpeg',
          },
        ],
      })
    }
  }

  input.push({
    role: 'user',
    content: [{ type: 'text', text: prompt }],
  })

  const MAX_RETRIES = 3
  let result: { image?: Buffer; text?: string } = {}

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const interaction = await getAi().interactions.create({
      model: 'gemini-3.1-flash-image-preview',
      input,
      response_modalities: ['image', 'text'],
      service_tier: GEMINI_SERVICE_TIER,
    })

    result =
      interaction.outputs?.reduce(
        (acc, output) => {
          if (output.type === 'text' && output.text) {
            acc.text = (acc.text || '') + output.text
          }
          if (output.type === 'image' && output.data) {
            acc.image = Buffer.from(output.data, 'base64')
          }
          return acc
        },
        {} as { image?: Buffer; text?: string },
      ) || {}

    if (result.image) {
      break
    }

    logger.warn({ attempt, maxRetries: MAX_RETRIES }, 'image_gen.no_image')
  }

  if (result.text) {
    result.text = cleanResponse(result.text)
  }

  return result
}

/**
 * Clean response text from markdown artifacts
 */
function cleanResponse(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/\*\*/g, '') // Remove bold
    .replace(/\*/g, '') // Remove italic
    .replace(/__/g, '') // Remove underline
    .replace(/`/g, '') // Remove inline code
    .replace(/#{1,6}\s/g, '') // Remove headers
    .trim()
}
