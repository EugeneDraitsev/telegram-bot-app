import { type Bot, type Context, InputFile } from 'grammy/web'

import {
  formatTelegramMarkdownV2,
  getCommandData,
  getMediaGroupMessages,
  getMultimodalCommandData,
  invokeReplyLambda,
  startCommandReaction,
  timedCall,
} from '@tg-bot/common'
import { generateImage, generateMultimodalCompletion } from './gemini'
import { searchImage } from './image-search'
import { translate } from './translate'
import { searchYoutube } from './youtube'

export const setupMultimodalGeminiCommands = async (
  ctx: Context,
  deferredCommands = false,
  model: string = 'gemini-3-flash-preview',
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
    const { combinedText, imagesData, replyId, chatId } = commandData
    const message = await timedCall(
      {
        type: 'model_call',
        source: 'command',
        name: `/${model.includes('pro') ? 'o' : 'q'}`,
        model,
        chatId: Number(chatId),
      },
      () =>
        generateMultimodalCompletion(
          combinedText,
          ctx.message,
          imagesData,
          model,
        ),
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
        console.error(`Error (Gemini AI): ${err.message}`)
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
        console.error('Failed to invoke reply worker', error),
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
      return ctx.reply(e.message, {
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
    setupMultimodalGeminiCommands(
      ctx,
      deferredCommands,
      'gemini-3-flash-preview',
    ),
  )

  bot.command('o', (ctx) =>
    setupMultimodalGeminiCommands(
      ctx,
      deferredCommands,
      'gemini-3.1-pro-preview',
    ),
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
