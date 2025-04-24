import type { ParseModeFlavor } from '@grammyjs/parse-mode'
import { type Bot, type Context, InputFile } from 'grammy'
import type { ChatModel, ImageModel } from 'openai/resources'

import { getMultimodalCommandData } from '@tg-bot/common'
import { DEFAULT_ERROR_MESSAGE } from '../utils'
import { generateImage, generateMultimodalCompletion } from './open-ai'

export const setupMultimodalOpenAiCommands = async (
  ctx: ParseModeFlavor<Context>,
  model: ChatModel = 'o4-mini',
) => {
  const { combinedText, imagesData, chatId, replyId } =
    await getMultimodalCommandData(ctx)

  const message = await generateMultimodalCompletion(
    combinedText,
    chatId,
    model,
    imagesData,
  )

  return ctx
    .replyWithMarkdownV2(message?.replace(/([\\-_\[\]()~>#+={}.!])/g, '\\$1'), {
      reply_parameters: { message_id: replyId },
    })
    .catch((err) => {
      console.error(err)
      return ctx.reply(message, { reply_parameters: { message_id: replyId } })
    })
    .catch((err) => {
      console.error(`Error (Open AI): ${err.message}`)
    })
}

export const setupImageGenerationOpenAiCommands = async (
  ctx: ParseModeFlavor<Context>,
  model: ImageModel = 'gpt-image-1',
) => {
  const { combinedText, imagesData, chatId, replyId } =
    await getMultimodalCommandData(ctx)

  try {
    const image = await generateImage(combinedText, chatId, model, imagesData)

    return ctx.replyWithPhoto(
      typeof image === 'string' ? image : new InputFile(image),
      {
        reply_parameters: { message_id: replyId },
      },
    )
  } catch (error) {
    console.error(`Generate Image error (Open AI): ${error.message}`)
    return ctx.reply(error.message || DEFAULT_ERROR_MESSAGE, {
      reply_parameters: { message_id: replyId },
    })
  }
}

const setupOpenAiCommands = (bot: Bot<ParseModeFlavor<Context>>) => {
  bot.command('e', (ctx) => setupImageGenerationOpenAiCommands(ctx, 'dall-e-3'))
  bot.command('ee', (ctx) => setupImageGenerationOpenAiCommands(ctx))

  bot.command('o', (ctx) => setupMultimodalOpenAiCommands(ctx))
}

export default setupOpenAiCommands
