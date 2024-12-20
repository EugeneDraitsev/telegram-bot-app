import type { ParseModeFlavor } from '@grammyjs/parse-mode'
import type { Bot, Context } from 'grammy'

import { getCryptoCurrency } from './crypto-currency'
import { getMainCurrencies } from './main-currency'
import { getRussianCurrency } from './russian-currency'

const getError = (err: Error, from: string): string => {
  console.log(err)
  return `Can't fetch currency from ${from}\n`
}

const setupCurrencyCommands = (bot: Bot<ParseModeFlavor<Context>>) => {
  bot.command('c', async (ctx) => {
    const promises = [
      getMainCurrencies().catch((err) =>
        getError(err, 'ExchangeRate and Fixer'),
      ),
      getRussianCurrency().catch((err) => getError(err, 'meduza')),
      getCryptoCurrency().catch((err) => getError(err, 'poloniex')),
    ]

    const result = await Promise.all(promises).then(
      (result) => `${result.join('\n')}`,
    )

    return ctx.replyWithHTML(result)
  })
}

export default setupCurrencyCommands
