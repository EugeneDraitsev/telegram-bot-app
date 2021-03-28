import { getMainCurrencies } from './main-currency'
import { getRussianCurrency } from './russian-currency'
import { getCryptoCurrency } from './crypto-currency'

const getError = (err: Error, from: string): string => {
  // eslint-disable-next-line no-console
  console.log(err)
  return `Can't fetch currency from ${from}\n`
}

export const getCurrency = (): Promise<string> => {
  const promises = [
    getMainCurrencies().catch((err) => getError(err, 'FFC and Fixer')),
    getRussianCurrency().catch((err) => getError(err, 'meduza')),
    getCryptoCurrency().catch((err) => getError(err, 'poloniex')),
  ]

  return Promise.all(promises).then((result) => `${result.join('\n')}`)
}
