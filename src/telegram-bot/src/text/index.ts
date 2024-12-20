import type { ParseModeFlavor } from '@grammyjs/parse-mode'
import type { Bot, Context } from 'grammy'

import { getCommandData } from '@tg-bot/common'
import { throwDice } from './dice'
import { huify } from './huiator'
import { getPrediction } from './magic8ball'
import { puntoSwitcher } from './punto-switcher'
import { yasnyfy } from './yasno'

const setupTextCommands = (bot: Bot<ParseModeFlavor<Context>>) => {
  bot.command('h', (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    const huext = huify(text)
    const result =
      text === huext ? 'https://www.youtube.com/watch?v=uEhw8urePQM' : huext
    return ctx.reply(result, {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.command('y', (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    const yasno = yasnyfy(text)
    return ctx.replyWithMarkdownV2(yasno, {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.command('dice', (ctx) => {
    const { text } = getCommandData(ctx.message)
    const diceRoll = Number.parseInt(text, 10)
    if (diceRoll) {
      return ctx.replyWithHTML(throwDice(Number.parseInt(text, 10) || 6), {
        reply_parameters: { message_id: ctx.message?.message_id || 0 },
      })
    }
    return ctx.replyWithDice('🎲')
  })

  bot.command('8', (ctx) => {
    const { replyId } = getCommandData(ctx.message)
    return ctx.replyWithSticker(getPrediction(), {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.command('shrug', (ctx) => {
    const { replyId } = getCommandData(ctx.message)
    return ctx.replyWithMarkdownV2('`¯\\\\_(ツ)_/¯`', {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.command('ps', (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(puntoSwitcher(text), {
      reply_parameters: { message_id: replyId },
    })
  })
}

export default setupTextCommands
