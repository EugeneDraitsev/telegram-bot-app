import { random } from 'lodash'
import type { Context, Telegraf } from 'telegraf'

import { checkCommand, getCommandData, isLink } from '@tg-bot/common'
import { puntoSwitcher } from './punto-switcher'
import { throwDice } from './dice'
import { zavovu } from './za-vovu'
import { huify } from './huiator'
import { yasnyfy } from './yasno'
import { sayThanksForLink } from './link-reply'
import { getPrediction } from './magic8ball'

const setupTextCommands = (bot: Telegraf<Context>) => {
  bot.hears(isLink, (ctx, next) => {
    if (ctx.message && random(0, 100, true) > 99.7) {
      ctx.reply(sayThanksForLink(), {
        reply_to_message_id: ctx.message.message_id,
      })
    }
    next?.()
  })

  bot.hears(checkCommand('/h'), (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    const huext = huify(text)
    const result =
      text === huext ? 'https://www.youtube.com/watch?v=q5bc4nmDNio' : huext
    return ctx.reply(result, { reply_to_message_id: replyId })
  })

  bot.hears(checkCommand('/y'), (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    const yasno = yasnyfy(text)
    return ctx.replyWithMarkdownV2(yasno, { reply_to_message_id: replyId })
  })

  bot.hears(checkCommand('/dice'), (ctx) => {
    const { text } = getCommandData(ctx.message)
    const diceRoll = parseInt(text, 10)
    if (diceRoll) {
      return ctx.replyWithHTML(throwDice(parseInt(text, 10) || 6), {
        reply_to_message_id: ctx.message?.message_id,
      })
    }
    return ctx.replyWithDice()
  })

  bot.hears(checkCommand('/8'), async (ctx) => {
    const { replyId } = getCommandData(ctx.message)
    return ctx.replyWithSticker(getPrediction(), {
      reply_to_message_id: replyId,
    })
  })

  bot.hears(checkCommand('/shrug'), (ctx) => {
    const { replyId } = getCommandData(ctx.message)
    return ctx.replyWithMarkdownV2('`¯\\\\_(ツ)_/¯`', {
      reply_to_message_id: replyId,
    })
  })

  bot.hears(checkCommand('/ps'), (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(puntoSwitcher(text), { reply_to_message_id: replyId })
  })

  bot.hears(checkCommand('/za'), (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(zavovu(text), { reply_to_message_id: replyId })
  })
}

export default setupTextCommands
