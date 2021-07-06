import axios from 'axios'
import { map, round, chunk } from 'lodash'

const fccApiKey = process.env.FCC_API_KEY || 'set_your_token'
const fixerKey = process.env.FIXER_API_KEY || 'set_your_token'
const timeout = 15000

const getFreeCurrencyData = async (): Promise<string> => {
  const currencies = ['USD_BYN', 'EUR_BYN', 'USD_SEK', 'EUR_SEK', 'USD_PLN', 'EUR_PLN']
  const url = 'https://free.currconv.com/api/v7/convert'

  const promises = chunk(currencies, 2).map((pair) =>
    axios(url, {
      timeout,
      params: { compact: 'y', apiKey: fccApiKey, q: pair.join(',') },
    }).then((x) => x.data),
  )

  const result = await Promise.all(promises)
  const mergedResult = Object.assign({}, ...result)

  const currencyMessage = map(
    mergedResult,
    (value, key) => `${key.replace('_', '/')}: ${round(value.val, 4)}`,
  ).join('\n')

  return `Курсы FCC:\n${currencyMessage}\n`
}

const getFixerData = async (): Promise<string> => {
  const url = 'http://data.fixer.io/api/latest'
  const { rates } = await axios(url, {
    timeout,
    params: { access_key: fixerKey, format: 1, base: 'EUR' },
  }).then((x) => x.data)

  return `Курсы fixer:\
          \nUSD/BYN: ${round(rates.BYN / rates.USD, 3)}\
          \nEUR/BYN: ${round(rates.BYN, 3)}\
          \nUSD/SEK: ${round(rates.SEK / rates.USD, 3)}\
          \nEUR/SEK: ${round(rates.SEK, 3)}\
          \nUSD/PLN: ${round(rates.PLN / rates.USD, 3)}\
          \nEUR/PLN: ${round(rates.PLN, 3)}
`
}

export const getMainCurrencies = async (): Promise<string> => {
  try {
    return await getFreeCurrencyData()
  } catch (e) {
    return getFixerData()
  }
}
