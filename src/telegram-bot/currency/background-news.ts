import { getErrorMessage, logger } from '@tg-bot/common'
import type {
  CurrencyBackgroundNews,
  CurrencyBackgroundNewsItem,
} from './types'

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search'
const SEARCH_TIMEOUT_MS = 12_000
const MAX_RESULTS_PER_QUERY = 6
const MAX_PROMPT_ITEMS = 8

const MARKET_NEWS_QUERIES = [
  'last 24 hours market moving news United States USD Eurozone EUR Belarus BYN Sweden SEK Poland PLN Ukraine UAH Russia RUB currency economy',
  'last 24 hours market moving news Brent crude oil Bitcoin Ethereum Cardano crypto',
] as const

type TavilySearchResult = {
  readonly content?: unknown
  readonly published_date?: unknown
  readonly title?: unknown
  readonly url?: unknown
}

type TavilySearchResponse = {
  readonly answer?: unknown
  readonly results?: unknown
}

type NewsSearchResult = {
  readonly answer?: string
  readonly items: readonly CurrencyBackgroundNewsItem[]
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getSource(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'unknown source'
  }
}

function toNewsItem(
  result: TavilySearchResult,
): CurrencyBackgroundNewsItem | undefined {
  const title = asText(result.title)
  const url = asText(result.url)

  if (!title || !url) {
    return undefined
  }

  return {
    title,
    url,
    source: getSource(url),
    content: asText(result.content),
    publishedDate: asText(result.published_date),
  }
}

async function searchTavily(
  apiKey: string,
  query: string,
): Promise<NewsSearchResult> {
  const response = await fetch(TAVILY_SEARCH_URL, {
    method: 'POST',
    signal: globalThis.AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      topic: 'news',
      time_range: 'day',
      search_depth: 'basic',
      max_results: MAX_RESULTS_PER_QUERY,
      include_answer: 'basic',
      include_raw_content: false,
      include_images: false,
    }),
  })

  if (!response.ok) {
    throw new Error(`Tavily HTTP ${response.status}`)
  }

  const data = (await response.json()) as TavilySearchResponse
  const results = Array.isArray(data.results) ? data.results : []

  return {
    answer: asText(data.answer),
    items: results
      .map((result) => toNewsItem(result as TavilySearchResult))
      .filter((item): item is CurrencyBackgroundNewsItem => Boolean(item)),
  }
}

function dedupeNewsItems(
  items: readonly CurrencyBackgroundNewsItem[],
): CurrencyBackgroundNewsItem[] {
  const seen = new Set<string>()
  const result: CurrencyBackgroundNewsItem[] = []

  for (const item of items) {
    if (seen.has(item.url)) {
      continue
    }

    seen.add(item.url)
    result.push(item)
  }

  return result
}

export async function fetchCurrencyBackgroundNews(): Promise<CurrencyBackgroundNews> {
  const apiKey = process.env.TAVILY_API_KEY

  if (!apiKey) {
    return {
      answers: [],
      errors: ['TAVILY_API_KEY is not set'],
      items: [],
    }
  }

  const errors: string[] = []
  const responses = await Promise.all(
    MARKET_NEWS_QUERIES.map((query) =>
      searchTavily(apiKey, query).catch((error) => {
        const message = getErrorMessage(error)
        logger.warn({ error: message, query }, 'currency.news_search_failed')
        errors.push(message)
        return { answer: undefined, items: [] }
      }),
    ),
  )

  return {
    answers: responses
      .map(({ answer }) => answer)
      .filter((answer): answer is string => Boolean(answer)),
    errors,
    items: dedupeNewsItems(responses.flatMap(({ items }) => items)),
  }
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 3)}...`
}

export function buildCurrencyBackgroundImagePrompt(
  news: CurrencyBackgroundNews,
): string {
  const summaries = news.answers.slice(0, 2)
  const headlines = news.items.slice(0, MAX_PROMPT_ITEMS).map((item, index) => {
    const content = item.content ? ` - ${truncate(item.content, 180)}` : ''
    return `${index + 1}. ${truncate(item.title, 120)} (${item.source})${content}`
  })

  return [
    'Create a vertical background illustration for a Telegram currency rates card.',
    'The image must be dark, premium, financial-news themed, and readable under white text tables.',
    'Use abstract editorial visual metaphors for these last-24-hour market news items.',
    'Do not include text, letters, numbers, logos, flags, maps, UI, charts with labels, or watermarks.',
    'Avoid portraits and identifiable politicians. Keep the center calm and low contrast.',
    'Use subtle references to currency markets, oil, and crypto: glass, light trails, commodity texture, digital ledgers, and city silhouettes.',
    summaries.length ? `News summaries:\n${summaries.join('\n')}` : undefined,
    headlines.length ? `Headlines:\n${headlines.join('\n')}` : undefined,
  ]
    .filter(Boolean)
    .join('\n\n')
}
