export interface CurrencyRateRow {
  readonly label: string
  readonly value?: string
  readonly values?: readonly string[]
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
