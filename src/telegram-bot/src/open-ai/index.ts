import type { ParseModeFlavor } from '@grammyjs/parse-mode'
import { type Bot, type Context, InputFile } from 'grammy'
import type { ChatModel } from 'openai/resources'

import { getCommandData, getMultimodalCommandData } from '@tg-bot/common'
import { DEFAULT_ERROR_MESSAGE } from '../utils'
import { generateImage, generateMultimodalCompletion } from './openai'

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

const setupOpenAiCommands = (bot: Bot<ParseModeFlavor<Context>>) => {
  bot.command('e', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    const chatId = ctx?.chat?.id ?? ''

    try {
      const image = await generateImage(text, chatId)

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
  })

  bot.command('o', (ctx) => setupMultimodalOpenAiCommands(ctx))
}

export default setupOpenAiCommands
