import type { InputRichMessage } from 'grammy/types'

export interface CurrenciesResponse {
  readonly provider: string
  readonly rates: {
    readonly [currency: string]: number
  }
}

export interface CurrencyRateRow {
  readonly label: string
  readonly value: string
  readonly change?: string
}

export interface CurrencyRateSection {
  readonly title: string
  readonly provider?: string
  readonly columns?:
    | readonly [string, string]
    | readonly [string, string, string]
  readonly rows: CurrencyRateRow[]
  readonly note?: string
  readonly error?: string
}

export interface CurrencyMessages {
  readonly text: string
  readonly richMessage: InputRichMessage
}
