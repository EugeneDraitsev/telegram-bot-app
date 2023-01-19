import { getMainCurrencies } from './main-currency'
import { getRussianCurrency } from './russian-currency'
import { getCryptoCurrency } from './crypto-currency'

const getError = (err: Error, from: string): string => {
  console.log(err)
  return `Can't fetch currency from ${from}\n`
}

export const getCurrency = (): Promise<string> => {
  const promises = [
    getMainCurrencies().catch((err) => getError(err, 'ExchangeRate and Fixer')),
    getRussianCurrency().catch((err) => getError(err, 'meduza')),
    getCryptoCurrency().catch((err) => getError(err, 'poloniex')),
  ]

  return Promise.all(promises).then((result) => `${result.join('\n')}`)
}
