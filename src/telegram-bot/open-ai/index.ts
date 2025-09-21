import { type Bot, type Context, InputFile } from 'grammy'
import type { ChatModel, ImageModel } from 'openai/resources'

import { getMultimodalCommandData, invokeReplyLambda } from '@tg-bot/common'
import { DEFAULT_ERROR_MESSAGE } from '../utils'
import { generateImage, generateMultimodalCompletion } from './open-ai'

export const setupMultimodalOpenAiCommands = async (
  ctx: Context,
  model: ChatModel = 'gpt-5-mini',
  deferredCommands = false,
) => {
  const commandData = await getMultimodalCommandData(ctx)
  if (deferredCommands) {
    // Don't wait for the response
    invokeReplyLambda(commandData)
    return
  } else {
    const { combinedText, imagesData, chatId, replyId } = commandData

    const message = await generateMultimodalCompletion(
      combinedText,
      chatId,
      model,
      imagesData,
    )

    return ctx
      .reply(message?.replace(/([\\-_[\]()~>#+={}.!])/g, '\\$1'), {
        reply_parameters: { message_id: replyId },
        parse_mode: 'MarkdownV2',
      })
      .catch((err) => {
        console.error(err)
        return ctx.reply(message, { reply_parameters: { message_id: replyId } })
      })
      .catch((err) => {
        console.error(`Error (Open AI): ${err.message}`)
      })
  }
}

export const setupImageGenerationOpenAiCommands = async (
  ctx: Context,
  model: ImageModel = 'gpt-image-1',
  deferredCommands = false,
) => {
  const commandData = await getMultimodalCommandData(ctx)

  if (deferredCommands) {
    // Don't wait for the response
    invokeReplyLambda(commandData)
    return
  } else {
    const { combinedText, imagesData, chatId, replyId } = commandData
    try {
      const image = await generateImage(combinedText, chatId, model, imagesData)

      return ctx.replyWithPhoto(
        typeof image === 'string' ? image : new InputFile(image),
        { reply_parameters: { message_id: replyId } },
      )
    } catch (error) {
      console.error(`Generate Image error (Open AI): ${error.message}`)
      return ctx.reply(error.message || DEFAULT_ERROR_MESSAGE, {
        reply_parameters: { message_id: replyId },
      })
    }
  }
}

const setupOpenAiCommands = (
  bot: Bot,
  { deferredCommands } = { deferredCommands: false },
) => {
  bot.command('e', (ctx) =>
    setupImageGenerationOpenAiCommands(ctx, 'dall-e-3', deferredCommands),
  )
  bot.command('ee', (ctx) =>
    setupImageGenerationOpenAiCommands(ctx, 'gpt-image-1', deferredCommands),
  )

  bot.command('o', (ctx) =>
    setupMultimodalOpenAiCommands(ctx, 'gpt-5-mini', deferredCommands),
  )
}

export default setupOpenAiCommands
