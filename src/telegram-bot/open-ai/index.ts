import { type Bot, type Context, InputFile } from 'grammy/web'
import type { ChatModel, ImageModel } from 'openai/resources'

import {
  DEFAULT_ERROR_MESSAGE,
  formatTelegramMarkdownV2,
  getMediaGroupMessages,
  getMultimodalCommandData,
  invokeReplyLambda,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
  startCommandReaction,
  timedCall,
} from '@tg-bot/common'
import { generateImage, generateMultimodalCompletion } from './open-ai'

const OPENAI_FAILURE_MESSAGES = new Set([
  DEFAULT_ERROR_MESSAGE,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
])

export const setupMultimodalOpenAiCommands = async (
  ctx: Context,
  model: ChatModel = 'gpt-5-mini',
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

    const message = await timedCall(
      {
        type: 'model_call',
        source: 'command',
        name: '/e',
        model: String(model),
        chatId: Number(chatId),
        classifyResult: (result) =>
          OPENAI_FAILURE_MESSAGES.has(result.trim()) ? 'error' : 'success',
      },
      () =>
        generateMultimodalCompletion(
          combinedText,
          Number(chatId),
          model,
          imagesData,
        ),
    )

    const normalizedMessage = message?.trim() || ''
    const replyText = normalizedMessage
      ? formatTelegramMarkdownV2(normalizedMessage)
      : DEFAULT_ERROR_MESSAGE

    return ctx
      .reply(replyText, {
        reply_parameters: { message_id: replyId },
        parse_mode: normalizedMessage ? 'MarkdownV2' : undefined,
      })
      .catch((err) => {
        console.error(err)
        return ctx.reply(normalizedMessage || DEFAULT_ERROR_MESSAGE, {
          reply_parameters: { message_id: replyId },
        })
      })
      .catch((err) => {
        console.error(`Error (Open AI): ${err.message}`)
      })
  } finally {
    stopReaction()
  }
}

export const setupImageGenerationOpenAiCommands = async (
  ctx: Context,
  model: ImageModel = 'gpt-image-1.5',
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
    try {
      const { image, text } = await timedCall(
        {
          type: 'model_call',
          source: 'command',
          name: '/ee',
          model: String(model),
          chatId: Number(chatId),
        },
        () => generateImage(combinedText, Number(chatId), model, imagesData),
      )

      const caption = text ? formatTelegramMarkdownV2(text) : undefined

      return ctx.replyWithPhoto(
        typeof image === 'string' ? image : new InputFile(image),
        {
          reply_parameters: { message_id: replyId },
          caption,
          parse_mode: caption ? 'MarkdownV2' : undefined,
        },
      )
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE
      console.error(`Generate Image error (Open AI): ${errorMessage}`)
      return ctx.reply(errorMessage, {
        reply_parameters: { message_id: replyId },
      })
    }
  } finally {
    stopReaction()
  }
}

const setupOpenAiCommands = (
  bot: Bot,
  { deferredCommands } = { deferredCommands: false },
) => {
  bot.command('e', (ctx) =>
    setupImageGenerationOpenAiCommands(ctx, 'gpt-image-1.5', deferredCommands),
  )
  bot.command('ee', (ctx) =>
    setupImageGenerationOpenAiCommands(ctx, 'gpt-image-1.5', deferredCommands),
  )
}

export default setupOpenAiCommands
