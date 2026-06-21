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
