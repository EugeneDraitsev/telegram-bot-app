import type { Bot } from 'grammy/web'

import { getCommandData } from '@tg-bot/common'
import { handleDebugImages } from '../utils'
import { throwDice } from './dice'
import { huify } from './huiator'
import { getPrediction } from './magic8ball'
import { puntoSwitcher } from './punto-switcher'
import { yasnyfy } from './yasno'

const setupTextCommands = (bot: Bot) => {
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
    return ctx.reply(yasno, {
      reply_parameters: { message_id: replyId },
      parse_mode: 'MarkdownV2',
    })
  })

  bot.command('dice', (ctx) => {
    const { text } = getCommandData(ctx.message)
    const diceRoll = Number.parseInt(text, 10)
    if (diceRoll) {
      return ctx.reply(throwDice(Number.parseInt(text, 10) || 6), {
        reply_parameters: { message_id: ctx.message?.message_id || 0 },
        parse_mode: 'HTML',
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
    return ctx.reply('`¯\\\\_(ツ)_/¯`', {
      reply_parameters: { message_id: replyId },
      parse_mode: 'MarkdownV2',
    })
  })

  bot.command('ps', (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(puntoSwitcher(text), {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.command('debugImages', handleDebugImages)
}

export default setupTextCommands
