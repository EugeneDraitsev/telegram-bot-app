import { type Bot, type Context, InputFile } from 'grammy/web'

import {
  DEFAULT_ERROR_MESSAGE,
  formatTelegramMarkdownV2,
  getMediaGroupMessages,
  getMultimodalCommandData,
  invokeReplyLambda,
  startCommandReaction,
} from '@tg-bot/common'
import { generateGemmaCompletion, generateImageDat1co } from './dat1co'

export const setupGemmaDat1coCommands = async (
  ctx: Context,
  deferredCommands = false,
) => {
  const extraMessages = await getMediaGroupMessages(ctx)
  const commandData = await getMultimodalCommandData(ctx, extraMessages)

  if (deferredCommands) {
    const stopReaction = startCommandReaction(ctx)
    try {
      // Wait only for Lambda async invoke ACK, not for worker execution.
      await invokeReplyLambda(commandData).catch((error) =>
        console.error('Failed to invoke reply worker', error),
      )
    } finally {
      stopReaction()
    }
    return
  }

  const stopReaction = startCommandReaction(ctx)
  try {
    const { combinedText, imagesData, chatId, replyId } = commandData
    const message = await generateGemmaCompletion(
      combinedText,
      chatId,
      imagesData,
    )

    const formatted = formatTelegramMarkdownV2(message)

    return ctx
      .reply(formatted, {
        reply_parameters: { message_id: replyId },
        parse_mode: 'MarkdownV2',
      })
      .catch((_e) => {
        return ctx.reply(message, { reply_parameters: { message_id: replyId } })
      })
      .catch((err) => {
        console.error(`Error (Gemma Dat1co): ${err.message}`)
      })
  } finally {
    stopReaction()
  }
}

export const setupImageGenerationDat1coCommands = async (
  ctx: Context,
  deferredCommands = false,
) => {
  const commandData = await getMultimodalCommandData(ctx)

  if (deferredCommands) {
    const stopReaction = startCommandReaction(ctx)
    try {
      // Wait only for Lambda async invoke ACK, not for worker execution.
      await invokeReplyLambda(commandData).catch((error) =>
        console.error('Failed to invoke reply worker', error),
      )
    } finally {
      stopReaction()
    }
    return
  }

  const stopReaction = startCommandReaction(ctx)
  try {
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
  } finally {
    stopReaction()
  }
}

const setupDat1coCommands = (
  bot: Bot,
  { deferredCommands } = { deferredCommands: false },
) => {
  bot.command('de', (ctx) =>
    setupImageGenerationDat1coCommands(ctx, deferredCommands),
  )
  bot.command('gemma', (ctx) => setupGemmaDat1coCommands(ctx, deferredCommands))
}

export default setupDat1coCommands
