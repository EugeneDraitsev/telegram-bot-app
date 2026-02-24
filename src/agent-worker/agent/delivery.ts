import { InputFile } from 'grammy/web'

import {
  cleanGeminiMessage,
  formatTelegramMarkdownV2,
  saveBotReplyToHistory,
} from '@tg-bot/common'
import { logger } from '../logger'
import type {
  AgentResponse,
  AnimationResponse,
  DiceResponse,
  ImageResponse,
  StickerResponse,
  TelegramApi,
  VideoResponse,
} from '../types'
import { MAX_CAPTION_LENGTH, MAX_TEXT_LENGTH } from './config'

interface DeliveryParams {
  api: TelegramApi
  chatId: number
  replyToMessageId: number
}

interface DeliveryBundle {
  text: string
  image: ImageResponse | null
  video: VideoResponse | null
  animation: AnimationResponse | null
  voice: Buffer | null
  sticker: StickerResponse | null
  dice: DiceResponse | null
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
  const bundle: DeliveryBundle = {
    text: '',
    image: null,
    video: null,
    animation: null,
    voice: null,
    sticker: null,
    dice: null,
  }
  const textParts: string[] = []

  for (const r of responses) {
    if (r.type === 'text') textParts.push(cleanGeminiMessage(r.text))
    else if (r.type === 'voice') bundle[r.type] = r.buffer
    // biome-ignore lint/suspicious/noExplicitAny: generic mapping
    else bundle[r.type] = r as any
  }

  bundle.text = textParts.join('\n\n').trim()
  return bundle
}

async function sendText(params: DeliveryParams & { text: string }) {
  const text = params.text.trim()
  if (!text) {
    return
  }

  try {
    const sentMessage = await params.api.sendMessage(
      params.chatId,
      formatText(text),
      {
        parse_mode: 'MarkdownV2',
        ...getReplyOptions(params.replyToMessageId),
      },
    )
    await saveBotReplyToHistory(sentMessage)
  } catch (err) {
    // Fallback: send as plain text if MarkdownV2 parsing fails
    logger.warn(
      { chatId: params.chatId, error: (err as Error).message },
      'delivery.markdown_fallback',
    )
    const sentMessage = await params.api.sendMessage(
      params.chatId,
      text.slice(0, MAX_TEXT_LENGTH),
      getReplyOptions(params.replyToMessageId),
    )
    await saveBotReplyToHistory(sentMessage)
  }
}

async function sendImage(
  params: DeliveryParams & { image: ImageResponse; text: string },
) {
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
    await saveBotReplyToHistory(sentMessage)
    return
  }

  if (!params.image.url) {
    await sendText({ ...params, text: rawCaption })
    return
  }

  try {
    const sentMessage = await params.api.sendPhoto(
      params.chatId,
      params.image.url,
      options,
    )
    await saveBotReplyToHistory(sentMessage)
  } catch {
    await sendText({
      ...params,
      text: rawCaption
        ? `${rawCaption}\n\n${params.image.url}`
        : params.image.url,
    })
  }
}

async function sendVideo(
  params: DeliveryParams & { video: VideoResponse; text: string },
) {
  const messageText = params.text
    ? `${params.text}\n\n${params.video.url}`
    : params.video.caption?.trim()
      ? `${params.video.caption.trim()}\n\n${params.video.url}`
      : params.video.url

  await sendText({ ...params, text: messageText })
}

async function sendAnimation(
  params: DeliveryParams & { animation: AnimationResponse; text: string },
) {
  const rawCaption = params.text || params.animation.caption || ''
  const caption = formatCaption(rawCaption)
  const options = {
    caption,
    parse_mode: caption ? 'MarkdownV2' : undefined,
    ...getReplyOptions(params.replyToMessageId),
  }

  try {
    const sentMessage = await params.api.sendAnimation(
      params.chatId,
      params.animation.url,
      options,
    )
    await saveBotReplyToHistory(sentMessage)
  } catch {
    await sendText({
      ...params,
      text: rawCaption
        ? `${rawCaption}\n\n${params.animation.url}`
        : params.animation.url,
    })
  }
}

async function sendVoice(
  params: DeliveryParams & { voice: Buffer; caption?: string },
) {
  const options = {
    ...getReplyOptions(params.replyToMessageId),
    ...(params.caption
      ? {
          caption: formatCaption(params.caption),
          parse_mode: 'MarkdownV2' as const,
        }
      : {}),
  }
  const sentMessage = await params.api.sendVoice(
    params.chatId,
    new InputFile(params.voice, 'voice.opus'),
    options,
  )
  await saveBotReplyToHistory(sentMessage)
}

async function sendSticker(
  params: DeliveryParams & { sticker: StickerResponse },
) {
  const sentMessage = await params.api.sendSticker(
    params.chatId,
    params.sticker.fileId,
    getReplyOptions(params.replyToMessageId),
  )
  await saveBotReplyToHistory(sentMessage)
}

async function sendDice(params: DeliveryParams & { dice: DiceResponse }) {
  const sentMessage = await params.api.sendDice(
    params.chatId,
    params.dice.emoji,
    getReplyOptions(params.replyToMessageId),
  )
  await saveBotReplyToHistory(sentMessage)
}

export async function sendResponses(
  params: DeliveryParams & { responses: AgentResponse[] },
): Promise<void> {
  if (params.responses.length === 0) {
    return
  }

  const bundle = collectBundle(params.responses)
  const base: DeliveryParams = {
    api: params.api,
    chatId: params.chatId,
    replyToMessageId: params.replyToMessageId,
  }

  try {
    // If we have voice + text → send voice with text as caption (one message)
    if (bundle.voice && bundle.text) {
      await sendVoice({ ...base, voice: bundle.voice, caption: bundle.text })
      return
    }

    const mediaParams = { ...base, text: bundle.text }
    if (bundle.dice) {
      await sendDice({ ...base, dice: bundle.dice })
      if (bundle.text) await sendText(mediaParams)
    } else if (bundle.sticker) {
      await sendSticker({ ...base, sticker: bundle.sticker })
      if (bundle.text) await sendText(mediaParams)
    } else if (bundle.animation) {
      await sendAnimation({ ...mediaParams, animation: bundle.animation })
    } else if (bundle.image) {
      await sendImage({ ...mediaParams, image: bundle.image })
    } else if (bundle.video) {
      await sendVideo({ ...mediaParams, video: bundle.video })
    } else if (bundle.text) {
      await sendText(mediaParams)
    }
  } catch (error) {
    logger.error({ error, chatId: params.chatId }, 'delivery.primary_failed')
  }

  // Voice without text (already handled above if both present)
  if (bundle.voice) {
    try {
      await sendVoice({ ...base, voice: bundle.voice })
    } catch (error) {
      logger.error({ error, chatId: params.chatId }, 'delivery.voice_failed')
    }
  }
}
