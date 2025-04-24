import OpenAi from 'openai'
import type {
  ChatCompletionContentPart,
  ChatModel,
  ImageModel,
} from 'openai/resources'
import { type Uploadable, toFile } from 'openai/uploads'

import {
  DEFAULT_ERROR_MESSAGE,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
  isAiEnabledChat,
  systemInstructions,
} from '../utils'

const openAi = new OpenAi({
  apiKey: process.env.OPENAI_API_KEY,
})

export const generateImage = async (
  prompt: string,
  chatId: string | number,
  model: ImageModel,
  imagesData?: Buffer[],
) => {
  if (!isAiEnabledChat(chatId)) {
    throw new Error(NOT_ALLOWED_ERROR)
  }
  if (!prompt) {
    throw new Error(PROMPT_MISSING_ERROR)
  }

  let response: OpenAi.Images.ImagesResponse

  if (imagesData?.length && model === 'gpt-image-1') {
    const image: Uploadable[] = []
    for (const imageData of imagesData) {
      image.push(await toFile(imageData, 'image.jpg', { type: 'image/jpeg' }))
    }

    response = await openAi.images.edit({
      prompt,
      quality: 'medium',
      model,
      image,
      n: 1,
      size: '1024x1024',
    })
  } else {
    response = await openAi.images.generate({
      prompt,
      quality: model === 'gpt-image-1' ? 'medium' : 'standard',
      model,
      n: 1,
      size: '1024x1024',
    })
  }

  if (response.data?.[0].b64_json) {
    return Buffer.from(response.data?.[0].b64_json || '', 'base64')
  }

  if (response.data?.[0].url) {
    return response.data?.[0].url
  }

  throw new Error(DEFAULT_ERROR_MESSAGE)
}

export const generateMultimodalCompletion = async (
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

    const completion = await openAi.chat.completions.create({
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
