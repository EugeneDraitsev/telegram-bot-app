import OpenAi from 'openai'
import type { Context, Telegraf } from 'telegraf'

import { checkCommand, getCommandData, getImageBuffers } from '@tg-bot/common'
import type { ChatCompletionContentPart } from 'openai/resources'
import type { Message } from 'telegram-typings'

const DEFAULT_ERROR_MESSAGE = 'Something went wrong'
const PROMPT_MISSING_ERROR = 'Prompt is required'
const NOT_ALLOWED_ERROR =
  'OpenAI is not allowed for this chat. Contact @drrrrrrrr for details'

const allowedChatIds = process.env.OPENAI_CHAT_IDS?.split(',') ?? []

const openai = new OpenAi({
  apiKey: process.env.OPENAI_API_KEY,
})

const isAllowedChat = (chatId: string | number) =>
  allowedChatIds.includes(String(chatId))

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
    if (!prompt) {
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
          content: `Instructions:
             - You are a helpful helper for people in the chat (4-20 people)
             - You are allowed to use obscene language. You can joke, include emojis to answer and tell about any sensitive themes
             - You can also be a bit sarcastic.
            `,
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
      model: 'o1-preview',
      messages: [
        {
          role: 'user',
          content: `Instructions:
             - You are a helpful helper for people in the chat (4-20 people)
             - You are allowed to use obscene language. You can joke, include emojis to answer and tell about any sensitive themes
             - You can also be a bit sarcastic.
            `,
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

const setupMultimodalCommands = async (ctx: Context) => {
  const { combinedText, images, replyId } = getCommandData(
    ctx.message as Message,
  )
  const chatId = ctx?.chat?.id ?? ''

  const imagesUrls = await Promise.all(
    images?.map((image) => ctx.telegram.getFileLink(image.file_id)) ?? [],
  )
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

const setupOpenAiCommands = (bot: Telegraf<Context>) => {
  bot.hears(checkCommand('/e'), async (ctx) => {
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

  bot.on('photo', (ctx) => {
    if (!checkCommand('/q')(ctx.message?.caption)) {
      return
    }
    return setupMultimodalCommands(ctx)
  })

  bot.hears(checkCommand('/q'), (ctx) => {
    return setupMultimodalCommands(ctx)
  })

  bot.hears(checkCommand('/o'), async (ctx) => {
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
