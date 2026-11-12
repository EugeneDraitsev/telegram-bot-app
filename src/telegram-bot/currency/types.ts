import type { InputRichMessage } from 'grammy/types'

import type {
  CurrencyRateRow as SharedCurrencyRateRow,
  CurrencyRateSection as SharedCurrencyRateSection,
} from '@tg-bot/common'

export interface CurrenciesResponse {
  readonly provider: string
  readonly rates: {
    readonly [currency: string]: number
  }
}

/** Rates and prices at one moment: the live ones, or one day of history. */
export interface CurrencySnapshot {
  /** Units of each currency per EUR, as the rate providers return them. */
  readonly rates: { readonly [currency: string]: number }
  /** USD prices of the coins and of Brent, by ticker. */
  readonly prices: { readonly [ticker: string]: number | undefined }
}

export interface CurrencyHistoryDay extends CurrencySnapshot {
  /** ISO date, such as 2026-11-05. */
  readonly date: string
}

export type CurrencyRateRow = SharedCurrencyRateRow

export type CurrencyRateSection = SharedCurrencyRateSection

export interface CurrencyBackgroundNewsItem {
  readonly title: string
  readonly url: string
  readonly source: string
  readonly content?: string
  readonly publishedDate?: string
}

export interface CurrencyBackgroundNews {
  readonly answers: readonly string[]
  readonly errors: readonly string[]
  readonly items: readonly CurrencyBackgroundNewsItem[]
}

export interface CurrencyBackground {
  readonly error?: string
  readonly image?: Buffer
  readonly news: CurrencyBackgroundNews
  readonly prompt?: string
}

export interface CurrencyMessages {
  readonly sections: CurrencyRateSection[]
  readonly text: string
  readonly richMessage: InputRichMessage
  readonly background?: CurrencyBackground
}
