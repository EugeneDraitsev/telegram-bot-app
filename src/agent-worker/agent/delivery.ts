import { InputFile } from 'grammy/web'

import {
  cleanGeminiMessage,
  formatTelegramMarkdownV2,
  saveBotReplyToHistory,
} from '@tg-bot/common'
import { logger } from '../logger'
import type {
  AgentResponse,
  ImageResponse,
  TelegramApi,
  VideoResponse,
} from '../types'
import { MAX_CAPTION_LENGTH, MAX_TEXT_LENGTH } from './config'

interface DeliveryBundle {
  text: string
  image: ImageResponse | null
  video: VideoResponse | null
  voice: Buffer | null
}

function getReplyOptions(replyToMessageId: number) {
  return { reply_parameters: { message_id: replyToMessageId } }
}

function formatText(text: string): string {
  return formatTelegramMarkdownV2(text.trim().slice(0, MAX_TEXT_LENGTH))
}

function formatCaption(text?: string): string | undefined {
  const normalized = text?.trim()
  if (!normalized) {
    return undefined
  }
  return formatTelegramMarkdownV2(normalized.slice(0, MAX_CAPTION_LENGTH))
}

function collectBundle(responses: AgentResponse[]): DeliveryBundle {
  const textParts: string[] = []
  let image: ImageResponse | null = null
  let video: VideoResponse | null = null
  let voice: Buffer | null = null

  for (const response of responses) {
    if (response.type === 'text') {
      textParts.push(cleanGeminiMessage(response.text))
    } else if (response.type === 'image') {
      image = response
    } else if (response.type === 'video') {
      video = response
    } else if (response.type === 'voice') {
      voice = response.buffer
    }
  }

  return {
    text: textParts.join('\n\n').trim(),
    image,
    video,
    voice,
  }
}

function saveHistoryBestEffort(sentMessage: unknown) {
  void saveBotReplyToHistory(sentMessage).catch((error) =>
    logger.warn({ error }, 'delivery.history_save_failed'),
  )
}

async function sendText(params: {
  api: TelegramApi
  chatId: number
  replyToMessageId: number
  text: string
}) {
  const text = params.text.trim()
  if (!text) {
    return
  }

  const sentMessage = await params.api.sendMessage(
    params.chatId,
    formatText(text),
    {
      parse_mode: 'MarkdownV2',
      ...getReplyOptions(params.replyToMessageId),
    },
  )
  saveHistoryBestEffort(sentMessage)
}

async function sendImage(params: {
  api: TelegramApi
  chatId: number
  replyToMessageId: number
  image: ImageResponse
  text: string
}) {
  const rawCaption = params.text || params.image.caption || ''
  const caption = formatCaption(rawCaption)
  const options = {
    caption,
    parse_mode: caption ? 'MarkdownV2' : undefined,
    ...getReplyOptions(params.replyToMessageId),
  }

  if (params.image.buffer) {
    const sentMessage = await params.api.sendPhoto(
      params.chatId,
      new InputFile(params.image.buffer),
      options,
    )
    saveHistoryBestEffort(sentMessage)
    return
  }

  if (!params.image.url) {
    await sendText({
      api: params.api,
      chatId: params.chatId,
      replyToMessageId: params.replyToMessageId,
      text: rawCaption,
    })
    return
  }

  try {
    const sentMessage = await params.api.sendPhoto(
      params.chatId,
      params.image.url,
      options,
    )
    saveHistoryBestEffort(sentMessage)
  } catch {
    await sendText({
      api: params.api,
      chatId: params.chatId,
      replyToMessageId: params.replyToMessageId,
      text: rawCaption
        ? `${rawCaption}\n\n${params.image.url}`
        : params.image.url,
    })
  }
}

async function sendVideo(params: {
  api: TelegramApi
  chatId: number
  replyToMessageId: number
  video: VideoResponse
  text: string
}) {
  const messageText = params.text
    ? `${params.text}\n\n${params.video.url}`
    : params.video.caption?.trim()
      ? `${params.video.caption.trim()}\n\n${params.video.url}`
      : params.video.url

  await sendText({
    api: params.api,
    chatId: params.chatId,
    replyToMessageId: params.replyToMessageId,
    text: messageText,
  })
}

async function sendVoice(params: {
  api: TelegramApi
  chatId: number
  replyToMessageId: number
  voice: Buffer
}) {
  const sentMessage = await params.api.sendVoice(
    params.chatId,
    new InputFile(params.voice, 'voice.opus'),
    getReplyOptions(params.replyToMessageId),
  )
  saveHistoryBestEffort(sentMessage)
}

export async function sendResponses(params: {
  responses: AgentResponse[]
  chatId: number
  replyToMessageId: number
  api: TelegramApi
}): Promise<void> {
  if (params.responses.length === 0) {
    return
  }

  const bundle = collectBundle(params.responses)

  try {
    if (bundle.image) {
      await sendImage({
        api: params.api,
        chatId: params.chatId,
        replyToMessageId: params.replyToMessageId,
        image: bundle.image,
        text: bundle.text,
      })
    } else if (bundle.video) {
      await sendVideo({
        api: params.api,
        chatId: params.chatId,
        replyToMessageId: params.replyToMessageId,
        video: bundle.video,
        text: bundle.text,
      })
    } else {
      await sendText({
        api: params.api,
        chatId: params.chatId,
        replyToMessageId: params.replyToMessageId,
        text: bundle.text,
      })
    }
  } catch (error) {
    logger.error({ error, chatId: params.chatId }, 'delivery.primary_failed')
  }

  if (!bundle.voice) {
    return
  }

  try {
    await sendVoice({
      api: params.api,
      chatId: params.chatId,
      replyToMessageId: params.replyToMessageId,
      voice: bundle.voice,
    })
  } catch (error) {
    logger.error({ error, chatId: params.chatId }, 'delivery.secondary_failed')
  }
}
