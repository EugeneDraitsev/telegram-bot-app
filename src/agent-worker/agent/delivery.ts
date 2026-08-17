import { InputFile } from 'grammy/web'

import {
  cleanModelMessage,
  formatTelegramMarkdownV2,
  isTelegramReplyTargetMissingError,
  logger,
  saveBotReplyToHistory,
  sendRichMessageWithFallback,
} from '@tg-bot/common'
import type {
  AgentResponse,
  AnimationResponse,
  AudioResponse,
  DiceResponse,
  ImageResponse,
  RichResponse,
  StickerResponse,
  TelegramApi,
  VideoResponse,
} from '../types'
import { MAX_CAPTION_LENGTH, MAX_TEXT_LENGTH } from './config'

interface DeliveryParams {
  api: TelegramApi
  chatId: number
  replyToMessageId?: number
}

interface DeliveryBundle {
  text: string
  image: ImageResponse | null
  video: VideoResponse | null
  audio: AudioResponse | null
  animation: AnimationResponse | null
  voice: Buffer | null
  sticker: StickerResponse | null
  dice: DiceResponse | null
  rich: RichResponse | null
}

const PRIMARY_MEDIA_ORDER = [
  'dice',
  'sticker',
  'animation',
  'image',
  'video',
  'audio',
] as const

function getReplyOptions(replyToMessageId?: number) {
  if (replyToMessageId === undefined) {
    return {}
  }

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

function getSentMessageId(messageLike: unknown): number | undefined {
  if (!messageLike || typeof messageLike !== 'object') {
    return undefined
  }

  const { message_id } = messageLike as { message_id?: unknown }
  return typeof message_id === 'number' ? message_id : undefined
}

function isVoiceMessagesForbiddenError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const description = (error as { description?: unknown }).description
  return (
    typeof description === 'string' &&
    /voice[_ ]messages[_ ]forbidden/i.test(description)
  )
}

function warnDroppedMedia(bundle: DeliveryBundle, chatId: number): void {
  const primaryMedia = PRIMARY_MEDIA_ORDER.filter(
    (type) => bundle[type] !== null,
  )
  let deliveredResponseType: string | undefined
  let droppedResponseTypes: string[] = []

  if (bundle.rich) {
    deliveredResponseType = 'rich'
    droppedResponseTypes = [...primaryMedia, ...(bundle.voice ? ['voice'] : [])]
  } else if (bundle.voice && bundle.text) {
    deliveredResponseType = 'voice'
    droppedResponseTypes = [...primaryMedia]
  } else if (primaryMedia.length > 1) {
    deliveredResponseType = primaryMedia[0]
    droppedResponseTypes = primaryMedia.slice(1)
  }

  if (!deliveredResponseType || droppedResponseTypes.length === 0) return
  logger.warn(
    { chatId, deliveredResponseType, droppedResponseTypes },
    'delivery.media_dropped',
  )
}

function getTelegramMentions(text: string): string[] {
  return text.match(/@[A-Za-z0-9_]{5,32}\b/g) ?? []
}

function hasTelegramMention(text: string): boolean {
  return getTelegramMentions(text).length > 0
}

function splitMentionBatches(text: string): string[] {
  const normalized = text.trim()
  const mentions = getTelegramMentions(normalized)
  if (mentions.length <= 5) {
    return [normalized]
  }

  const body = normalized
    .replace(/@[A-Za-z0-9_]{5,32}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const batches: string[] = []
  for (let index = 0; index < mentions.length; index += 5) {
    const chunk = mentions.slice(index, index + 5).join(' ')
    batches.push(index === 0 ? [body, chunk].filter(Boolean).join('\n') : chunk)
  }

  return batches
}

async function sendPlainText(params: DeliveryParams & { text: string }) {
  const sentMessage = await params.api.sendMessage(
    params.chatId,
    params.text.slice(0, MAX_TEXT_LENGTH),
    getReplyOptions(params.replyToMessageId),
  )
  await saveBotReplyToHistory(sentMessage)
  return sentMessage
}

function collectBundle(responses: AgentResponse[]): DeliveryBundle {
  const bundle: DeliveryBundle = {
    text: '',
    image: null,
    video: null,
    audio: null,
    animation: null,
    voice: null,
    sticker: null,
    dice: null,
    rich: null,
  }
  const textParts: string[] = []

  for (const r of responses) {
    if (r.type === 'text') textParts.push(cleanModelMessage(r.text))
    else if (r.type === 'rich') bundle.rich = r
    else if (r.type === 'voice') bundle[r.type] = r.buffer
    // biome-ignore lint/suspicious/noExplicitAny: generic mapping
    else bundle[r.type] = r as any
  }

  bundle.text = textParts.join('\n\n').trim()
  return bundle
}

async function sendRichResponse(
  params: DeliveryParams & { rich: RichResponse },
) {
  const sentMessage = await sendRichMessageWithFallback({
    api: params.api,
    chatId: params.chatId,
    richMessage: params.rich.richMessage,
    fallbackText: params.rich.fallbackText.slice(0, MAX_TEXT_LENGTH),
    richOptions: getReplyOptions(params.replyToMessageId),
    fallbackOptions: getReplyOptions(params.replyToMessageId),
  })
  await saveBotReplyToHistory(sentMessage)
  return sentMessage
}

async function sendText(params: DeliveryParams & { text: string }) {
  const text = params.text.trim()
  if (!text) {
    return
  }

  let replyToMessageId = params.replyToMessageId
  for (const chunk of splitMentionBatches(text)) {
    if (hasTelegramMention(chunk)) {
      const sentMessage = await sendPlainText({
        ...params,
        text: chunk,
        replyToMessageId,
      })
      replyToMessageId = sentMessage.message_id
      continue
    }

    const fallbackOptions = {
      parse_mode: 'MarkdownV2' as const,
      ...getReplyOptions(replyToMessageId),
    }

    try {
      const sentMessage = await sendRichMessageWithFallback({
        api: params.api,
        chatId: params.chatId,
        richMessage: { markdown: chunk.slice(0, MAX_TEXT_LENGTH) },
        fallbackText: formatText(chunk),
        richOptions: getReplyOptions(replyToMessageId),
        fallbackOptions,
      })
      await saveBotReplyToHistory(sentMessage)
      replyToMessageId = getSentMessageId(sentMessage) ?? replyToMessageId
    } catch (err) {
      logger.warn(
        { chatId: params.chatId, error: (err as Error).message },
        'delivery.markdown_fallback',
      )
      const sentMessage = await sendPlainText({
        ...params,
        text: chunk,
        replyToMessageId,
      })
      replyToMessageId = sentMessage.message_id
    }
  }
}

async function sendImage(
  params: DeliveryParams & { image: ImageResponse; text: string },
) {
  const rawCaption = params.text || params.image.caption || ''
  const caption = formatCaption(rawCaption)
  const options = {
    caption,
    parse_mode: caption ? ('MarkdownV2' as const) : undefined,
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
  const rawCaption = params.video.caption || params.text || ''
  const caption = formatCaption(rawCaption)
  const options = {
    caption,
    parse_mode: caption ? ('MarkdownV2' as const) : undefined,
    supports_streaming: true,
    ...getReplyOptions(params.replyToMessageId),
  }

  if (params.video.buffer) {
    const sentMessage = await params.api.sendVideo(
      params.chatId,
      new InputFile(
        params.video.buffer,
        params.video.fileName || 'generated-video.mp4',
      ),
      options,
    )
    await saveBotReplyToHistory(sentMessage)
    return
  }

  if (!params.video.url) {
    if (rawCaption) await sendText({ ...params, text: rawCaption })
    return
  }

  const messageText = params.text
    ? `${params.text}\n\n${params.video.url}`
    : params.video.caption?.trim()
      ? `${params.video.caption.trim()}\n\n${params.video.url}`
      : params.video.url

  await sendText({ ...params, text: messageText })
}

async function sendGeneratedAudio(
  params: DeliveryParams & { audio: AudioResponse; text: string },
) {
  const captionText = [params.audio.title, params.audio.caption]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
  const caption = formatCaption([...new Set(captionText)].join('\n'))
  const options = {
    caption,
    parse_mode: caption ? ('MarkdownV2' as const) : undefined,
    ...getReplyOptions(params.replyToMessageId),
  }
  const inputFile = () =>
    new InputFile(
      params.audio.buffer,
      params.audio.fileName || 'generated-music.mp3',
    )
  let sentMessage:
    | Awaited<ReturnType<TelegramApi['sendVoice']>>
    | Awaited<ReturnType<TelegramApi['sendAudio']>>
  try {
    sentMessage = await params.api.sendVoice(
      params.chatId,
      inputFile(),
      options,
    )
  } catch (error) {
    if (!isVoiceMessagesForbiddenError(error)) throw error

    logger.warn(
      { chatId: params.chatId },
      'delivery.voice_forbidden_audio_fallback',
    )
    const fallbackCaption = formatCaption(params.audio.caption)
    sentMessage = await params.api.sendAudio(params.chatId, inputFile(), {
      ...(params.audio.title?.trim()
        ? { title: params.audio.title.trim().slice(0, 64) }
        : {}),
      caption: fallbackCaption,
      parse_mode: fallbackCaption ? ('MarkdownV2' as const) : undefined,
      ...getReplyOptions(params.replyToMessageId),
    })
  }
  await saveBotReplyToHistory(sentMessage)

  if (params.text) {
    await sendText({
      ...params,
      text: params.text,
      replyToMessageId:
        getSentMessageId(sentMessage) ?? params.replyToMessageId,
    })
  }
}

async function sendAnimation(
  params: DeliveryParams & { animation: AnimationResponse; text: string },
) {
  const rawCaption = params.text || params.animation.caption || ''
  const caption = formatCaption(rawCaption)
  const options = {
    caption,
    parse_mode: caption ? ('MarkdownV2' as const) : undefined,
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

async function sendResponsesOnce(
  params: DeliveryParams & { responses: AgentResponse[] },
): Promise<void> {
  if (params.responses.length === 0) return

  const bundle = collectBundle(params.responses)
  warnDroppedMedia(bundle, params.chatId)
  const base: DeliveryParams = {
    api: params.api,
    chatId: params.chatId,
    replyToMessageId: params.replyToMessageId,
  }

  try {
    // Keep voice+text as a single message, but preserve legacy voice-only
    // behavior for mixed bundles (e.g. image + voice).
    if (bundle.rich) {
      const sentMessage = await sendRichResponse({
        ...base,
        rich: bundle.rich,
      })
      if (bundle.text) {
        await sendText({
          ...base,
          text: bundle.text,
          replyToMessageId:
            getSentMessageId(sentMessage) ?? base.replyToMessageId,
        })
      }
      return
    }

    if (bundle.voice && bundle.text) {
      await sendVoice({
        ...base,
        voice: bundle.voice,
        caption: bundle.text,
      })
      return
    }

    const mediaParams = { ...base, text: bundle.text }
    if (bundle.dice) {
      await sendDice({ ...base, dice: bundle.dice })
      if (bundle.text) await sendText(mediaParams)
    } else if (bundle.sticker) {
      try {
        await sendSticker({ ...base, sticker: bundle.sticker })
      } catch (error) {
        if (
          base.replyToMessageId !== undefined &&
          isTelegramReplyTargetMissingError(error)
        ) {
          throw error
        }
        logger.warn({ error, chatId: params.chatId }, 'delivery.sticker_failed')
      }
      if (bundle.text) await sendText(mediaParams)
    } else if (bundle.animation) {
      await sendAnimation({ ...mediaParams, animation: bundle.animation })
    } else if (bundle.image) {
      await sendImage({ ...mediaParams, image: bundle.image })
    } else if (bundle.video) {
      await sendVideo({ ...mediaParams, video: bundle.video })
    } else if (bundle.audio) {
      await sendGeneratedAudio({ ...mediaParams, audio: bundle.audio })
    } else if (bundle.text) {
      await sendText(mediaParams)
    }
  } catch (error) {
    if (
      params.replyToMessageId !== undefined &&
      isTelegramReplyTargetMissingError(error)
    ) {
      throw error
    }
    logger.error({ error, chatId: params.chatId }, 'delivery.primary_failed')
    if (!bundle.voice) {
      throw error
    }
  }

  if (bundle.voice) {
    try {
      await sendVoice({ ...base, voice: bundle.voice })
    } catch (error) {
      if (
        params.replyToMessageId !== undefined &&
        isTelegramReplyTargetMissingError(error)
      ) {
        throw error
      }
      logger.error({ error, chatId: params.chatId }, 'delivery.voice_failed')
      throw error
    }
  }
}

export async function sendResponses(
  params: DeliveryParams & { responses: AgentResponse[] },
): Promise<void> {
  try {
    await sendResponsesOnce(params)
  } catch (error) {
    if (
      params.replyToMessageId === undefined ||
      !isTelegramReplyTargetMissingError(error)
    ) {
      throw error
    }

    logger.warn(
      {
        chatId: params.chatId,
        replyToMessageId: params.replyToMessageId,
      },
      'delivery.reply_target_missing',
    )
    await sendResponsesOnce({ ...params, replyToMessageId: undefined })
  }
}
