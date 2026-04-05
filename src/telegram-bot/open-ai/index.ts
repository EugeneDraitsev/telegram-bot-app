import { type Bot, type Context, InputFile } from 'grammy/web'
import type { ChatModel, ImageModel } from 'openai/resources'

import {
  DEFAULT_ERROR_MESSAGE,
  formatTelegramMarkdownV2,
  getMediaGroupMessages,
  getMultimodalCommandData,
  invokeReplyLambda,
  logger,
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

const toError = (value: unknown) =>
  value instanceof Error ? value : new Error(String(value))

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
        logger.error({ err: error }, 'Failed to invoke reply worker'),
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
        const error = toError(err)
        logger.error({ err: error }, 'Error (Open AI)')
        return ctx.reply(normalizedMessage || DEFAULT_ERROR_MESSAGE, {
          reply_parameters: { message_id: replyId },
        })
      })
      .catch((err) => {
        const error = toError(err)
        logger.error({ err: error }, 'Error (Open AI)')
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
        logger.error({ err: error }, 'Failed to invoke reply worker'),
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
      const err = toError(error)
      const errorMessage = err.message || DEFAULT_ERROR_MESSAGE
      logger.error({ err }, 'Generate Image error (Open AI)')
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
