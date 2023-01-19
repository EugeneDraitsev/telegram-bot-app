import axios from 'axios'

const fixerKey = process.env.FIXER_API_KEY || 'set_your_token'
const timeout = 15000

const formatRow = (value: number, length = 10) => value.toFixed(2).padStart(length, ' ')

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

  const ratesToDisplay = {
    'USD/BYN': rates.BYN / rates.USD,
    'EUR/BYN': rates.BYN,
    'USD/SEK': rates.SEK / rates.USD,
    'EUR/SEK': rates.SEK,
    'USD/PLN': rates.PLN / rates.USD,
    'EUR/PLN': rates.PLN,
    'USD/TRY': rates.TRY / rates.USD,
  }

  const maxLength = Math.max(...Object.values(ratesToDisplay).map((x) => x.toFixed(2).length))

  const ratesString = Object.entries(ratesToDisplay)
    .map(([key, value]) => `${key}: ${formatRow(value, maxLength)}`)
    .join('\n')

  return `Курсы ${provider}:<pre>${ratesString}</pre>\n`
}

export const getMainCurrencies = async (): Promise<string> => {
  try {
    const url = 'https://api.exchangerate.host/latest'
    const provider = 'ExchangeRate host'
    return await getExchangeRateData(url, provider)
  } catch (e) {
    console.error('ExchangeRate host error', e)
    const url = 'http://data.fixer.io/api/latest'
    const provider = 'fixer'

    return getExchangeRateData(url, provider).catch((err) => {
      console.error('Fixer API error', err)
      throw err
    })
  }
}
