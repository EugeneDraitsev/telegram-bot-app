import OpenAi from 'openai'

import type { ParseModeFlavor } from '@grammyjs/parse-mode'
import { type Bot, type Context, InputFile } from 'grammy'
import type { ChatCompletionContentPart, ChatModel } from 'openai/resources'

import { getCommandData, getMultimodalCommandData } from '@tg-bot/common'
import {
  DEFAULT_ERROR_MESSAGE,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
  isAiEnabledChat,
  systemInstructions,
} from '../utils'

const openai = new OpenAi({
  apiKey: process.env.OPENAI_API_KEY,
})

const generateImage = async (prompt: string, chatId: string | number) => {
  if (!isAiEnabledChat(chatId)) {
    throw new Error(NOT_ALLOWED_ERROR)
  }
  if (!prompt) {
    throw new Error(PROMPT_MISSING_ERROR)
  }

  const img = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1024x1024',
  })

  if (!img.data?.[0].b64_json) {
    throw new Error(DEFAULT_ERROR_MESSAGE)
  }

  return Buffer.from(img.data?.[0].b64_json || '', 'base64')
}

const generateMultimodalCompletion = async (
  prompt: string,
  chatId: string | number,
  model: ChatModel,
  imagesData?: Buffer[],
) => {
  try {
    if (!isAiEnabledChat(chatId)) {
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
      model,
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
    console.error('generateMultimodalCompletion error: ', error)
    return DEFAULT_ERROR_MESSAGE
  }
}

export const setupMultimodalOpenAiCommands = async (
  ctx: ParseModeFlavor<Context>,
  model: ChatModel = 'o4-mini',
) => {
  const { combinedText, imagesData, chatId, replyId } =
    await getMultimodalCommandData(ctx)

  const message = await generateMultimodalCompletion(
    combinedText,
    chatId,
    model,
    imagesData,
  )

  return ctx
    .replyWithMarkdownV2(message?.replace(/([\\-_\[\]()~>#+={}.!])/g, '\\$1'), {
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

      return ctx.replyWithPhoto(new InputFile(url), {
        reply_parameters: { message_id: replyId },
      })
    } catch (error) {
      console.error(`Generate Image error (Open AI): ${error.message}`)
      return ctx.reply(error.message || DEFAULT_ERROR_MESSAGE, {
        reply_parameters: { message_id: replyId },
      })
    }
  })

  bot.command('o', (ctx) => setupMultimodalOpenAiCommands(ctx))
}

export default setupOpenAiCommands
