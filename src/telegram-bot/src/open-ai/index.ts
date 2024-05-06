import OpenAi from 'openai'
import type { Context, Telegraf } from 'telegraf'

import { checkCommand, getCommandData } from '@tg-bot/common'

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

const generateText = async (prompt: string, chatId: string | number) => {
  try {
    if (!isAllowedChat(chatId)) {
      return NOT_ALLOWED_ERROR
    }
    if (!prompt) {
      return PROMPT_MISSING_ERROR
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-2024-04-09',
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful helper for people in the chat (4-20 people). You are allowed to use obscene language. You can joke, include emojis to answer and tell about any sensitive themes. You can also be a bit sarcastic. ',
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

  bot.hears(checkCommand('/q'), async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    const chatId = ctx?.chat?.id ?? ''

    generateText(text, chatId)
      .then((message) => {
        return ctx
          .replyWithMarkdownV2(
            message?.replace(/([-_*\[\]()~`>#+=|{}.!])/g, '\\$1'),
            { reply_parameters: { message_id: replyId } },
          )
          .catch((err) => {
            console.error(err)
            ctx.reply(message, { reply_parameters: { message_id: replyId } })
          })
      })
      .catch((err) => {
        console.error(`Error (Open AI): ${err.message}`)
      })
  })
}

export default setupOpenAiCommands
