import type { Context, Telegraf } from 'telegraf'

import { getMainCurrencies } from './main-currency'
import { getRussianCurrency } from './russian-currency'
import { getCryptoCurrency } from './crypto-currency'
import { checkCommand } from '@tg-bot/common'

const getError = (err: Error, from: string): string => {
  console.log(err)
  return `Can't fetch currency from ${from}\n`
}

const setupCurrencyCommands = (bot: Telegraf<Context>) => {
  bot.hears(checkCommand('/c'), async (ctx) => {
    const promises = [
      getMainCurrencies().catch((err) => getError(err, 'ExchangeRate and Fixer')),
      getRussianCurrency().catch((err) => getError(err, 'meduza')),
      getCryptoCurrency().catch((err) => getError(err, 'poloniex')),
    ]

    const result = await Promise.all(promises).then((result) => `${result.join('\n')}`)

    return ctx.replyWithHTML(result)
  })
}

export default setupCurrencyCommands
