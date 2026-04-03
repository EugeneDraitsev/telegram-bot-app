const timeout = 10_000
const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const fetchYahoo = async () => {
  const res = await fetch(
    'https://query1.finance.yahoo.com/v8/finance/chart/BZ=F',
    {
      headers,
      signal: globalThis.AbortSignal.timeout(timeout),
    },
  )

  if (!res.ok) throw new Error(`Yahoo HTTP Error: ${res.status}`)

  const data = await res.json()
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
  console.log(`[Source: Yahoo] Price: ${price}`)
  return price
}

const fetchCnbc = async () => {
  const res = await fetch(
    'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=@LCO.1&output=json',
    // Добавили User-Agent сюда тоже, чтобы серверные запросы меньше блокировали
    { headers, signal: globalThis.AbortSignal.timeout(timeout) },
  )

  if (!res.ok) throw new Error(`CNBC HTTP Error: ${res.status}`)

  const data = await res.json()
  const price = data?.FormattedQuoteResult?.FormattedQuote?.[0]?.last
  console.log(`[Source: CNBC] Price: ${price}`)
  return price ? Number(price) : undefined
}

export const fetchBrentPrice = async () => {
  try {
    const priceCnbc = await fetchCnbc()
    if (priceCnbc !== undefined) return priceCnbc
  } catch (e) {
    console.warn('CNBC failed, falling back to Yahoo...', getErrorMessage(e))
  }

  try {
    const priceYahoo = await fetchYahoo()
    if (priceYahoo !== undefined) return priceYahoo
  } catch (e) {
    console.error('Yahoo also failed...', getErrorMessage(e))
  }

  return undefined
}
