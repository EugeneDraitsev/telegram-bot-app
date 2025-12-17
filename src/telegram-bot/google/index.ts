import { type Bot, type Context, InputFile } from 'grammy/web'

import {
  getCommandData,
  getMultimodalCommandData,
  invokeReplyLambda,
} from '@tg-bot/common'
import { getMediaGroupMessages } from '../utils'
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
    // Don't wait for the response
    invokeReplyLambda(commandData)
    return
  } else {
    const { combinedText, imagesData, replyId } = commandData
    const message = await generateMultimodalCompletion(
      combinedText,
      ctx.message,
      imagesData,
      model,
    )

    return ctx
      .reply(message.replace(/([\\-_[\]()~>#+={}.!])/g, '\\$1'), {
        reply_parameters: { message_id: replyId },
        parse_mode: 'MarkdownV2',
      })
      .catch((_e) => {
        return ctx.reply(message, { reply_parameters: { message_id: replyId } })
      })
      .catch((err) => {
        console.error(`Error (Gemini AI): ${err.message}`)
      })
  }
}

export const setupImageGenerationGeminiCommands = async (
  ctx: Context,
  deferredCommands = false,
) => {
  const extraMessages = await getMediaGroupMessages(ctx)
  const commandData = await getMultimodalCommandData(ctx, extraMessages)
  if (deferredCommands) {
    // Don't wait for the response
    invokeReplyLambda(commandData)
    return
  } else {
    const response = await generateImage(
      commandData.combinedText,
      commandData.chatId,
      commandData.imagesData,
    )

    if (response.image) {
      return ctx.replyWithPhoto(new InputFile(response.image), {
        caption: response.text,
        reply_parameters: { message_id: commandData.replyId },
      })
    }

    return ctx.reply(response.text, {
      reply_parameters: { message_id: commandData.replyId },
    })
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
      'gemini-3-pro-preview',
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

  bot.command('tb', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text, 'be'), {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.command('tr', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text, 'ru'), {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.command('tp', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text, 'pl'), {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.command('ts', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text, 'sv'), {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.command('td', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text, 'de'), {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.command('te', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text, 'en'), {
      reply_parameters: { message_id: replyId },
    })
  })
}

export default setupGoogleCommands
