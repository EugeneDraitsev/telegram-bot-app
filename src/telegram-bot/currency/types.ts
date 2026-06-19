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

export interface CurrencyMessages {
  readonly sections: CurrencyRateSection[]
  readonly text: string
  readonly richMessage: InputRichMessage
}
