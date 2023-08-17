const fixerKey = process.env.FIXER_API_KEY || 'set_your_token'
const timeout = 10_000
const BYN_RATES_URL = 'https://www.bsb.by/ajax.php?request=currencyrate'

const formatRow = (value: number, length = 10) =>
  value.toFixed(2).padStart(length, ' ')

const getExchangeRateData = async (
  url: string,
  provider: string,
): Promise<string> => {
  // More precise BYN rates
  const bynRatesPromise = fetch(BYN_RATES_URL, {
    signal: AbortSignal.timeout(timeout),
  })
    .then((x) => x.json())
    // ignore errors
    .catch(() => null)

  // Other currencies rates
  const params = new URLSearchParams({
    access_key: fixerKey,
    format: '1',
    base: 'EUR',
  })

  const ratesPromise = fetch(`${url}?${params}`, {
    signal: AbortSignal.timeout(timeout),
  }).then((x) => x.json())

  const [{ data: bynRates }, { rates }] = await Promise.all([
    bynRatesPromise,
    ratesPromise,
  ])

  const ratesToDisplay = {
    '🇧🇾USD/BYN': Number(bynRates?.USD?.BUY?.BYN) || rates.BYN / rates.USD,
    '🇧🇾EUR/BYN': Number(bynRates?.EUR?.BUY?.BYN) || rates.BYN,
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
