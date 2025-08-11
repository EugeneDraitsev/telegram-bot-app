import { type Bot, type Context, InputFile } from 'grammy'

import { getMultimodalCommandData } from '@tg-bot/common'
import { DEFAULT_ERROR_MESSAGE } from '../utils'
import { generateImageDat1co } from './dat1co'

export const setupImageGenerationDat1coCommands = async (ctx: Context) => {
  const { combinedText, chatId, replyId } = await getMultimodalCommandData(ctx)

  try {
    const image = await generateImageDat1co(combinedText, chatId)

    return ctx.replyWithPhoto(
      typeof image === 'string' ? image : new InputFile(image),
      { reply_parameters: { message_id: replyId } },
    )
  } catch (error) {
    console.error(`Generate Image error (Dat1co): ${error.message}`)
    return ctx.reply(error.message || DEFAULT_ERROR_MESSAGE, {
      reply_parameters: { message_id: replyId },
    })
  }
}

const setupDat1coCommands = (bot: Bot) => {
  bot.command('de', (ctx) => setupImageGenerationDat1coCommands(ctx))
}

export default setupDat1coCommands
