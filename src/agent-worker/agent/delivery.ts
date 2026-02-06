import { InputFile } from 'grammy/web'

import {
  cleanGeminiMessage,
  formatTelegramMarkdownV2,
  saveBotReplyToHistory,
} from '@tg-bot/common'
import type {
  AgentResponse,
  ImageResponse,
  TelegramApi,
  VideoResponse,
} from '../types'
import { MAX_CAPTION_LENGTH, MAX_TEXT_LENGTH } from './config'

interface DeliveryContext {
  api: TelegramApi
  chatId: number
  replyToMessageId: number
}

interface DeliveryState {
  mergedText: string
  image: ImageResponse | null
  video: VideoResponse | null
  voiceBuffer: Buffer | null
  videoNoteBuffer: Buffer | null
}

function getReplyOptions(replyToMessageId: number) {
  return { reply_parameters: { message_id: replyToMessageId } }
}

function normalizeText(rawText: string): string {
  return rawText.trim().slice(0, MAX_TEXT_LENGTH)
}

function formatCaption(caption: string | undefined): string | undefined {
  const normalized = caption?.trim()
  if (!normalized) {
    return undefined
  }

  return formatTelegramMarkdownV2(normalized.slice(0, MAX_CAPTION_LENGTH))
}

function buildVideoText(video: VideoResponse, mergedText: string): string {
  if (mergedText) {
    const separatorLength = 2
    const maxPrefixLength = MAX_TEXT_LENGTH - video.url.length - separatorLength
    const prefix = mergedText.slice(0, Math.max(maxPrefixLength, 0))
    return `${prefix}\n\n${video.url}`.trim()
  }

  if (video.caption?.trim()) {
    return `${video.caption.trim()}\n\n${video.url}`
  }

  return video.url
}

function collectDeliveryState(responses: AgentResponse[]): DeliveryState {
  const textParts: string[] = []
  let image: ImageResponse | null = null
  let video: VideoResponse | null = null
  let voiceBuffer: Buffer | null = null
  let videoNoteBuffer: Buffer | null = null

  for (const response of responses) {
    switch (response.type) {
      case 'text':
        textParts.push(cleanGeminiMessage(response.text))
        break
      case 'image':
        image = response
        break
      case 'video':
        video = response
        break
      case 'voice':
        voiceBuffer = response.buffer
        break
      case 'video_note':
        videoNoteBuffer = response.buffer
        break
    }
  }

  return {
    mergedText: textParts.join('\n\n').trim(),
    image,
    video,
    voiceBuffer,
    videoNoteBuffer,
  }
}

async function sendAndSave(sentMessagePromise: Promise<unknown>) {
  const sentMessage = await sentMessagePromise
  await saveBotReplyToHistory(sentMessage)
}

async function sendFormattedText(context: DeliveryContext, text: string) {
  const normalizedText = normalizeText(text)
  if (!normalizedText) {
    return
  }

  const formatted = formatTelegramMarkdownV2(normalizedText)

  await sendAndSave(
    context.api.sendMessage(context.chatId, formatted, {
      parse_mode: 'MarkdownV2',
      ...getReplyOptions(context.replyToMessageId),
    }),
  )
}

async function sendImage(context: DeliveryContext, state: DeliveryState) {
  const image = state.image
  if (!image) {
    return
  }

  const rawCaption = state.mergedText || image.caption || ''
  const caption = formatCaption(rawCaption)
  const photoOptions = {
    caption,
    parse_mode: caption ? 'MarkdownV2' : undefined,
    ...getReplyOptions(context.replyToMessageId),
  }

  if (image.buffer) {
    await sendAndSave(
      context.api.sendPhoto(
        context.chatId,
        new InputFile(image.buffer),
        photoOptions,
      ),
    )
    return
  }

  if (!image.url) {
    if (rawCaption) {
      await sendFormattedText(context, rawCaption)
    }
    return
  }

  try {
    await sendAndSave(
      context.api.sendPhoto(context.chatId, image.url, photoOptions),
    )
  } catch {
    const fallbackText = rawCaption
      ? `${rawCaption}\n\n${image.url}`
      : image.url
    await sendFormattedText(context, fallbackText)
  }
}

async function sendVideo(context: DeliveryContext, state: DeliveryState) {
  if (!state.video) {
    return
  }

  await sendFormattedText(
    context,
    buildVideoText(state.video, state.mergedText),
  )
}

async function sendPrimaryResponse(
  context: DeliveryContext,
  state: DeliveryState,
) {
  if (state.image) {
    await sendImage(context, state)
    return
  }

  if (state.video) {
    await sendVideo(context, state)
    return
  }

  if (state.mergedText) {
    await sendFormattedText(context, state.mergedText)
  }
}

async function sendSecondaryResponse(
  context: DeliveryContext,
  state: DeliveryState,
) {
  if (state.voiceBuffer) {
    await sendAndSave(
      context.api.sendVoice(context.chatId, new InputFile(state.voiceBuffer), {
        ...getReplyOptions(context.replyToMessageId),
      }),
    )
    return
  }

  if (state.videoNoteBuffer) {
    await sendAndSave(
      context.api.sendVideoNote(
        context.chatId,
        new InputFile(state.videoNoteBuffer),
        {
          ...getReplyOptions(context.replyToMessageId),
        },
      ),
    )
  }
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

  const state = collectDeliveryState(params.responses)
  const context: DeliveryContext = {
    api: params.api,
    chatId: params.chatId,
    replyToMessageId: params.replyToMessageId,
  }

  try {
    await sendPrimaryResponse(context, state)
  } catch (error) {
    console.error('[Agent] Error sending primary response:', error)
  }

  try {
    await sendSecondaryResponse(context, state)
  } catch (error) {
    console.error('[Agent] Error sending secondary response:', error)
  }
}
