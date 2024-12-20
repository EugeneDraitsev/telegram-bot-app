type Currency = {
  current: number
}

const timeout = 10_000

const formatRow = (key: string, value: number, length = 10) => {
  return `${key.toUpperCase()}: ${value
    .toFixed(2)
    .padStart(length - key.length, ' ')}`
}

export const getRussianCurrency = async (): Promise<string> => {
  const currencyCodes = ['usd', 'eur']
  const medusaUrl = 'https://meduza.io/api/misc/stock/all'
  const brentUrl = 'https://oilprice.com/freewidgets/json_get_oilprices'

  const currency: Record<string, Currency> = await fetch(medusaUrl, {
    signal: globalThis.AbortSignal.timeout(timeout),
  })
    .then((x) => x.json())
    .catch(() => {
      console.error('Failed to fetch currency data from meduza')
    })

  const brentPrice =
    currency?.brent?.current ||
    (await fetch(brentUrl, {
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest',
      },
      body: 'blend_id=46&period=2',
      method: 'POST',
      mode: 'cors',
      signal: globalThis.AbortSignal.timeout(timeout),
    })
      .then((x) => x.json())
      .then((x) => x?.last_price)
      .catch((e) => console.error('Failed to fetch brent price: ', e)))

  // fallback brent value if meduza returns undefined
  currency.brent = { current: brentPrice }

  const maxLength = Math.max(
    ...Object.entries(currency).map(
      ([key, value]) => String(value.current).length + key.length,
    ),
  )

  const currencyString = Object.keys(currency)
    .filter((curr) => currencyCodes.includes(curr))
    .map((key) => formatRow(key, Number(currency[key].current), maxLength))
    .join('\n')

  const brentString = brentPrice ? `\nBRENT: ${brentPrice}` : ''

  return `Курсы медузы:\n<pre>${currencyString}${brentString}</pre>\n`
}
