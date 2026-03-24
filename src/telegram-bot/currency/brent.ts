const timeout = 10_000

const fetchYahoo = () =>
  fetch('https://query1.finance.yahoo.com/v8/finance/chart/BZ=F', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    signal: globalThis.AbortSignal.timeout(timeout),
  })
    .then((x) => x.json())
    .then(
      (x) =>
        x?.chart?.result?.[0]?.meta?.regularMarketPrice as number | undefined,
    )

const fetchCnbc = () =>
  fetch(
    'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=@LCO.1&output=json',
    { signal: globalThis.AbortSignal.timeout(timeout) },
  )
    .then((x) => x.json())
    .then(
      (x) =>
        x?.FormattedQuoteResult?.FormattedQuote?.[0]?.last as
          | string
          | undefined,
    )
    .then((x) => (x ? Number(x) : undefined))

export const fetchBrentPrice = () =>
  fetchYahoo()
    .then((price) => price ?? fetchCnbc())
    .catch(() =>
      fetchCnbc().catch((e) =>
        console.error('Failed to fetch brent price: ', e),
      ),
    )
