import { type Bot, type Context, InputFile } from 'grammy/web'

import {
  DEFAULT_ERROR_MESSAGE,
  EMPTY_RESPONSE_ERROR,
  formatTelegramMarkdownV2,
  GEMINI_FLASH_IMAGE_MODEL,
  GEMINI_PRO_IMAGE_MODEL,
  getCommandData,
  getMediaGroupMessages,
  getMultimodalCommandData,
  logger,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
  startCommandReaction,
  timedCall,
} from '@tg-bot/common'
import { DIRECT_AGENT_COMMANDS, handleAgenticCommand } from '../agent'
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
export const GEMINI_FLASH_LITE_MODEL = 'gemini-3.1-flash-lite'

export const setupMultimodalGeminiCommands = async (
  ctx: Context,
  model: string = GEMMA_MODEL,
  commandName = '/gemma',
) => {
  const extraMessages = await getMediaGroupMessages(ctx)
  const commandData = await getMultimodalCommandData(ctx, extraMessages)

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
  modelConfig = GEMINI_FLASH_IMAGE_MODEL,
  commandName = '/ge',
) => {
  const extraMessages = await getMediaGroupMessages(ctx)
  const commandData = await getMultimodalCommandData(ctx, extraMessages)

  const stopReaction = startCommandReaction(ctx)
  try {
    const response = await timedCall(
      {
        type: 'model_call',
        source: 'command',
        name: commandName,
        model: modelConfig.model,
        chatId: Number(commandData.chatId),
        classifyResult: (result) => (result.image ? 'success' : 'error'),
      },
      () =>
        generateImage(
          commandData.combinedText,
          commandData.chatId,
          commandData.imagesData,
          commandData.imageInputs,
          { modelConfig },
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

const setupGoogleCommands = (bot: Bot) => {
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

  bot.command('gemma', (ctx) =>
    setupMultimodalGeminiCommands(ctx, GEMMA_MODEL, '/gemma'),
  )

  bot.command(DIRECT_AGENT_COMMANDS, (ctx) => handleAgenticCommand(ctx))

  bot.command('ge', (ctx) => setupImageGenerationGeminiCommands(ctx))
  bot.command('gp', (ctx) =>
    setupImageGenerationGeminiCommands(ctx, GEMINI_PRO_IMAGE_MODEL, '/gp'),
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
