const fixerKey = process.env.FIXER_API_KEY || 'set_your_token'
const exchangeRateKey = process.env.EXCHANGE_RATE_API_KEY || 'set_your_token'
const timeout = 10_000

const formatRow = (value: number, length = 10) =>
  value.toFixed(2).padStart(length, ' ')

// More precise BYN rates
const getBynRates = async () => {
  try {
    const BYN_RATES_URL =
      'https://mobile.bsb.by/api/v1/free-zone-management/exchange-rates/rates'
    const data = await fetch(BYN_RATES_URL, {
      signal: AbortSignal.timeout(timeout),
      method: 'POST',
      body: JSON.stringify({
        bankDepartmentId: 7,
        period: Date.now(),
        type: 'CASH',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    }).then((x) => x.json())

    const usdRate = data.rates?.find(
      (x: any) => x.buyCurrencyName === 'USD' && x.sellCurrencyName === 'BYN',
    )?.sellAmount

    const eurRate = data.rates?.find(
      (x: any) => x.buyCurrencyName === 'EUR' && x.sellCurrencyName === 'BYN',
    )?.sellAmount

    return {
      USD: usdRate,
      EUR: eurRate,
    }
  } catch (e) {
    console.error('Can not fetch BYN rates', e)
    return {}
  }
}

const getExchangeRateData = async (
  url: string,
  provider: string,
  access_key: string,
): Promise<string> => {
  const params = new URLSearchParams({
    access_key,
    format: '1',
    base: 'EUR',
  })

  const ratesPromise = fetch(`${url}?${params}`, {
    signal: AbortSignal.timeout(timeout),
  })
    .then((x) => x.json())
    .then((x) => x.rates)

  const [bynRates, rates] = await Promise.all([getBynRates(), ratesPromise])

  const ratesToDisplay = {
    '🇧🇾USD/BYN': Number(bynRates?.USD) || rates.BYN / rates.USD,
    '🇧🇾EUR/BYN': Number(bynRates?.EUR) || rates.BYN,
    '🇸🇪USD/SEK': rates.SEK / rates.USD,
    '🇸🇪EUR/SEK': rates.SEK,
    '🇵🇱USD/PLN': rates.PLN / rates.USD,
    '🇵🇱EUR/PLN': rates.PLN,
  }

  const maxLength = Math.max(
    ...Object.values(ratesToDisplay).map((x) => x.toFixed(2).length),
  )

  const ratesString = Object.entries(ratesToDisplay)
    .map(([key, value]) => `${key}: ${formatRow(value, maxLength)}`)
    .join('\n')

  return `Курсы ${provider}:\n<pre>${ratesString}</pre>\n`
}

export const getMainCurrencies = async () => {
  try {
    const url = 'http://api.exchangeratesapi.io/v1/latest'
    const provider = 'ExchangeRatesAPI'
    return await getExchangeRateData(url, provider, exchangeRateKey)
  } catch (e) {
    console.error('ExchangeRate host error', e)
    const url = 'http://data.fixer.io/api/latest'
    const provider = 'fixer'

    return getExchangeRateData(url, provider, fixerKey).catch((err) => {
      console.error('Fixer API error', err)
      throw err
    })
  }
}
