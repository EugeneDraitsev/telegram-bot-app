import OpenAi from 'openai'

import type { ParseModeFlavor } from '@grammyjs/parse-mode'
import type { Bot, Context } from 'grammy'
import type { ChatCompletionContentPart } from 'openai/resources'
import type { Message } from 'telegram-typings'

import { getCommandData, getImageBuffers } from '@tg-bot/common'
import {
  DEFAULT_ERROR_MESSAGE,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
  isAllowedChat,
  systemInstructions,
} from '../utils'

const openai = new OpenAi({
  apiKey: process.env.OPENAI_API_KEY,
})

const generateImage = async (prompt: string, chatId: string | number) => {
  if (!isAllowedChat(chatId)) {
    throw new Error(NOT_ALLOWED_ERROR)
  }
  if (!prompt) {
    throw new Error(PROMPT_MISSING_ERROR)
  }

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1024x1024',
  })

  const { url } = response.data[0]

  if (!url) {
    throw new Error(DEFAULT_ERROR_MESSAGE)
  }

  return url
}

const generateMultimodalCompletion = async (
  prompt: string,
  chatId: string | number,
  imagesData?: Buffer[],
) => {
  try {
    if (!isAllowedChat(chatId)) {
      return NOT_ALLOWED_ERROR
    }
    if (!prompt && !imagesData?.length) {
      return PROMPT_MISSING_ERROR
    }

    const content: ChatCompletionContentPart[] = [
      { type: 'text', text: prompt },
    ]

    for (const image of imagesData ?? []) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${image.toString('base64')}`,
        },
      })
    }

    const completion = await openai.chat.completions.create({
      model: 'chatgpt-4o-latest',
      messages: [
        {
          role: 'system',
          content: systemInstructions,
        },
        {
          role: 'user',
          content,
        },
      ],
      user: String(chatId),
    })
    const { message } = completion.choices[0]

    if (!message?.content) {
      return DEFAULT_ERROR_MESSAGE
    }

    return message.content
  } catch (error) {
    console.log(error.message)
    return DEFAULT_ERROR_MESSAGE
  }
}

const generateReasoningCompletion = async (
  prompt: string,
  chatId: string | number,
) => {
  try {
    if (!isAllowedChat(chatId)) {
      return NOT_ALLOWED_ERROR
    }
    if (!prompt) {
      return PROMPT_MISSING_ERROR
    }

    const completion = await openai.chat.completions.create({
      model: 'o3-mini',
      messages: [
        {
          role: 'user',
          content: systemInstructions,
        },
        { role: 'user', content: prompt },
      ],
      user: String(chatId),
    })
    const { message } = completion.choices[0]

    if (!message?.content) {
      return DEFAULT_ERROR_MESSAGE
    }

    return message.content
  } catch (error) {
    console.log(error.message)
    return DEFAULT_ERROR_MESSAGE
  }
}

const setupMultimodalCommands = async (ctx: ParseModeFlavor<Context>) => {
  const { combinedText, images, replyId } = getCommandData(
    ctx.message as Message,
  )
  const chatId = ctx?.chat?.id ?? ''

  const files = await Promise.all(
    images?.map((image) => ctx.api.getFile(image.file_id)) ?? [],
  )

  const imagesUrls = files.map((file) => {
    return `https://api.telegram.org/file/bot${process.env.TOKEN || ''}/${file.file_path}`
  })

  const imagesData = await getImageBuffers(imagesUrls)

  const message = await generateMultimodalCompletion(
    combinedText,
    chatId,
    imagesData,
  )

  return ctx
    .replyWithMarkdownV2(message?.replace(/([-_\[\]()~>#+={}.!])/g, '\\$1'), {
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
      const url = await generateImage(text, chatId)

      return ctx.replyWithPhoto(url, {
        reply_parameters: { message_id: replyId },
      })
    } catch (error) {
      return ctx.reply(error.message || DEFAULT_ERROR_MESSAGE, {
        reply_parameters: { message_id: replyId },
      })
    }
  })

  bot.on('message:photo', (ctx) => {
    if (!ctx.message?.caption?.startsWith('/q')) {
      return
    }
    return setupMultimodalCommands(ctx)
  })

  bot.command('q', (ctx) => {
    return setupMultimodalCommands(ctx)
  })

  bot.command('o', async (ctx) => {
    const { combinedText, replyId } = getCommandData(ctx.message)
    const chatId = ctx?.chat?.id ?? ''

    const message = await generateReasoningCompletion(combinedText, chatId)

    return ctx
      .replyWithMarkdownV2(message?.replace(/([-_\[\]()~>#+={}.!])/g, '\\$1'), {
        reply_parameters: { message_id: replyId },
      })
      .catch((err) => {
        console.error(err)
        return ctx.reply(message, { reply_parameters: { message_id: replyId } })
      })
      .catch((err) => {
        console.error(`Error (Open AI): ${err.message}`)
      })
  })
}

export default setupOpenAiCommands
