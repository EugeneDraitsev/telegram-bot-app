import { type Bot, type Context, InputFile } from 'grammy/web'

import {
  DEFAULT_ERROR_MESSAGE,
  EMPTY_RESPONSE_ERROR,
  formatTelegramMarkdownV2,
  getCommandData,
  getMediaGroupMessages,
  getMultimodalCommandData,
  invokeReplyLambda,
  logger,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
  startCommandReaction,
  timedCall,
} from '@tg-bot/common'
import { generateImage, generateMultimodalCompletion } from './gemini'
import { searchImage } from './image-search'
import { translate } from './translate'
import { searchYoutube } from './youtube'

const GEMINI_FAILURE_MESSAGES = new Set([
  DEFAULT_ERROR_MESSAGE,
  EMPTY_RESPONSE_ERROR,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
])

export const GEMMA_MODEL = 'gemma-4-31b-it'
export const GEMINI_Q_MODEL = 'gemini-3.1-flash-lite-preview'

export const setupMultimodalGeminiCommands = async (
  ctx: Context,
  deferredCommands = false,
  model: string = GEMINI_Q_MODEL,
  commandName = '/q',
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
    const { combinedText, imagesData, imageInputs, replyId, chatId } =
      commandData
    const message = await timedCall(
      {
        type: 'model_call',
        source: 'command',
        name: commandName,
        model,
        chatId: Number(chatId),
        classifyResult: (result) =>
          GEMINI_FAILURE_MESSAGES.has(result.trim()) ? 'error' : 'success',
      },
      () =>
        generateMultimodalCompletion({
          prompt: combinedText,
          message: ctx.message,
          imagesData,
          imageInputs,
          model,
          api: ctx.api,
        }),
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
        const error = err instanceof Error ? err : new Error(String(err))
        logger.error({ err: error }, 'Error (Gemini AI)')
      })
  } finally {
    stopReaction()
  }
}

export const setupImageGenerationGeminiCommands = async (
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
        logger.error({ err: error }, 'Failed to invoke reply worker'),
      )
    } finally {
      stopReaction()
    }
    return
  }

  const stopReaction = startCommandReaction(ctx)
  try {
    const response = await timedCall(
      {
        type: 'model_call',
        source: 'command',
        name: '/ge',
        model: 'gemini-3.1-flash-image-preview',
        chatId: Number(commandData.chatId),
        classifyResult: (result) => (result.image ? 'success' : 'error'),
      },
      () =>
        generateImage(
          commandData.combinedText,
          commandData.chatId,
          commandData.imagesData,
        ),
    )

    if (response.image) {
      const caption = response.text
        ? formatTelegramMarkdownV2(response.text)
        : undefined

      return ctx.replyWithPhoto(new InputFile(response.image), {
        caption,
        parse_mode: caption ? 'MarkdownV2' : undefined,
        reply_parameters: { message_id: commandData.replyId },
      })
    }

    return ctx.reply(formatTelegramMarkdownV2(response.text), {
      reply_parameters: { message_id: commandData.replyId },
      parse_mode: 'MarkdownV2',
    })
  } finally {
    stopReaction()
  }
}

const setupGoogleCommands = (
  bot: Bot,
  { deferredCommands } = { deferredCommands: false },
) => {
  bot.command('g', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    try {
      const { url, tbUrl } = await searchImage(text)
      return await ctx
        .replyWithPhoto(url, {
          reply_parameters: { message_id: replyId },
        })
        .catch(() =>
          ctx.replyWithPhoto(tbUrl, {
            reply_parameters: { message_id: replyId },
          }),
        )
        .catch(() => {
          ctx.reply(`Can't load ${url} to telegram (tabUrl: ${tbUrl})`, {
            reply_parameters: { message_id: replyId },
          })
        })
    } catch (e) {
      return ctx.reply(e instanceof Error ? e.message : String(e), {
        reply_parameters: { message_id: replyId },
      })
    }
  })

  bot.command('v', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await searchYoutube(text), {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.command(['q', 'qq'], (ctx) =>
    setupMultimodalGeminiCommands(ctx, deferredCommands, GEMINI_Q_MODEL, '/q'),
  )

  bot.command('gemma', (ctx) =>
    setupMultimodalGeminiCommands(ctx, deferredCommands, GEMMA_MODEL, '/gemma'),
  )

  bot.command('ge', (ctx) =>
    setupImageGenerationGeminiCommands(ctx, deferredCommands),
  )

  /*
   Translate commands
   */
  bot.command('t', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text), {
      reply_parameters: { message_id: replyId },
    })
  })

  const translateCommands = [
    ['tb', 'be'],
    ['tr', 'ru'],
    ['tp', 'pl'],
    ['ts', 'sv'],
    ['td', 'de'],
    ['te', 'en'],
  ] as const

  for (const [cmd, lang] of translateCommands) {
    bot.command(cmd, async (ctx) => {
      const { text, replyId } = getCommandData(ctx.message)
      return ctx.reply(await translate(text, lang), {
        reply_parameters: { message_id: replyId },
      })
    })
  }
}

export default setupGoogleCommands
