import { type Bot, type Context, InputFile } from 'grammy/web'

import {
  DEFAULT_ERROR_MESSAGE,
  formatTelegramMarkdownV2,
  getMediaGroupMessages,
  getMultimodalCommandData,
  logger,
  NOT_ALLOWED_ERROR,
  OPENAI_GPT_IMAGE_MODEL,
  PROMPT_MISSING_ERROR,
  startCommandReaction,
  timedCall,
} from '@tg-bot/common'
import {
  generateImage,
  generateMultimodalCompletion,
  type OpenAiReasoningEffort,
  type SupportedImageModel,
  type SupportedTextModel,
} from './open-ai'

const OPENAI_FAILURE_MESSAGES = new Set([
  DEFAULT_ERROR_MESSAGE,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
])

const toError = (value: unknown) =>
  value instanceof Error ? value : new Error(String(value))

export const OPENAI_O_MODEL = 'gpt-5.5' as const
export const OPENAI_O_REASONING_EFFORT = 'medium' as const

export const setupMultimodalOpenAiCommands = async (
  ctx: Context,
  model: SupportedTextModel = OPENAI_O_MODEL,
  commandName = '/o',
  reasoningEffort: OpenAiReasoningEffort = OPENAI_O_REASONING_EFFORT,
) => {
  const extraMessages = await getMediaGroupMessages(ctx)
  const commandData = await getMultimodalCommandData(ctx, extraMessages)

  const stopReaction = startCommandReaction(ctx)
  try {
    const {
      combinedText,
      imagesData,
      imageInputs,
      chatId,
      replyId,
      message: commandMessage,
    } = commandData

    const responseMessage = await timedCall(
      {
        type: 'model_call',
        source: 'command',
        name: commandName,
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
          reasoningEffort,
          {
            message: commandMessage,
            imageInputs,
            api: ctx.api,
          },
        ),
    )

    const normalizedMessage = responseMessage?.trim() || ''
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
  model: SupportedImageModel = OPENAI_GPT_IMAGE_MODEL,
  commandName = '/e',
) => {
  const extraMessages = await getMediaGroupMessages(ctx)
  const commandData = await getMultimodalCommandData(ctx, extraMessages)

  const stopReaction = startCommandReaction(ctx)
  try {
    const { combinedText, imagesData, imageInputs, chatId, replyId } =
      commandData
    try {
      const { image, text } = await timedCall(
        {
          type: 'model_call',
          source: 'command',
          name: commandName,
          model: String(model),
          chatId: Number(chatId),
        },
        () =>
          generateImage(
            combinedText,
            Number(chatId),
            model,
            imagesData,
            imageInputs,
          ),
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

const setupOpenAiCommands = (bot: Bot) => {
  for (const command of ['e', 'ee']) {
    bot.command(command, (ctx) =>
      setupImageGenerationOpenAiCommands(
        ctx,
        OPENAI_GPT_IMAGE_MODEL,
        `/${command}`,
      ),
    )
  }

  bot.command('o', (ctx) =>
    setupMultimodalOpenAiCommands(
      ctx,
      OPENAI_O_MODEL,
      '/o',
      OPENAI_O_REASONING_EFFORT,
    ),
  )
}

export default setupOpenAiCommands
