import axios from 'axios'
import { round } from 'lodash'

const fixerKey = process.env.FIXER_API_KEY || 'set_your_token'
const timeout = 15000

const getExchangeRateData = async (url: string, provider: string): Promise<string> => {
  const { rates } = await axios(url, {
    timeout,
    params: { access_key: fixerKey, format: 1, base: 'EUR' },
  }).then((x) => {
    if (!x.data.success) {
      throw new Error(x.data.error.info)
    }
    return x.data
  })

  return `Курсы ${provider}:\
          \nUSD/BYN: ${round(rates.BYN / rates.USD, 3)}\
          \nEUR/BYN: ${round(rates.BYN, 3)}\
          \nUSD/SEK: ${round(rates.SEK / rates.USD, 3)}\
          \nEUR/SEK: ${round(rates.SEK, 3)}\
          \nUSD/PLN: ${round(rates.PLN / rates.USD, 3)}\
          \nEUR/PLN: ${round(rates.PLN, 3)}\
          \nUSD/TRY: ${round(rates.TRY / rates.USD, 2)}
`
}

export const getMainCurrencies = async (): Promise<string> => {
  try {
    const url = 'https://api.exchangerate.host/latest'
    const provider = 'exchangerate host'
    return await getExchangeRateData(url, provider)
  } catch (e) {
    console.error('exchangerate host error', e)
    const url = 'http://data.fixer.io/api/latest'
    const provider = 'fixer'

    return getExchangeRateData(url, provider).catch((err) => {
      console.error('Fixer API error', err)
      throw err
    })
  }
}
