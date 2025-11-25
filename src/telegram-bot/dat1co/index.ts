import { type Bot, type Context, InputFile } from 'grammy/web'

import { getMultimodalCommandData, invokeReplyLambda } from '@tg-bot/common'
import { DEFAULT_ERROR_MESSAGE } from '../utils'
import { generateImageDat1co } from './dat1co'

export const setupImageGenerationDat1coCommands = async (
  ctx: Context,
  deferredCommands = false,
) => {
  const commandData = await getMultimodalCommandData(ctx)

  if (deferredCommands) {
    // Don't wait for the response
    invokeReplyLambda(commandData)
    return
  } else {
    const { combinedText, chatId, replyId } = commandData

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
}

const setupDat1coCommands = (
  bot: Bot,
  { deferredCommands } = { deferredCommands: false },
) => {
  bot.command('de', (ctx) =>
    setupImageGenerationDat1coCommands(ctx, deferredCommands),
  )
}

export default setupDat1coCommands
