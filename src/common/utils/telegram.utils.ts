import type { Api } from 'grammy'
import type { Chat, Message, User } from 'grammy/types'
import type { Context } from 'grammy/web'

import { logger } from '../logger'
import { getMessageText } from './message-text.utils'

export function isTelegramReplyTargetMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as {
    error_code?: unknown
    description?: unknown
    message?: unknown
  }
  const description =
    typeof candidate.description === 'string'
      ? candidate.description
      : typeof candidate.message === 'string'
        ? candidate.message
        : ''

  return (
    candidate.error_code === 400 &&
    description.toLowerCase().includes('message to be replied not found')
  )
}

export const findCommand = (text = ''): string =>
  text
    .replace(/(\r\n|\n|\r)/gm, '')
    .replace(/ .*/, '')
    .replace(/@.*/, '')

export const getParsedText = (text = '') => {
  const trimmedText = text.trimStart()

  if (/^\/[A-Za-z0-9_]+(?:@\w+)?(?:\s|$)/.test(trimmedText)) {
    return trimmedText.replace(/^\/[A-Za-z0-9_]+(?:@\w+)?(?:\s+|$)/, '')
  }

  return text
}

export const getUserName = (user?: User | Chat) =>
  user?.username ||
  `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
  String(user?.id ?? 'Unknown Chat')

export const getCommandData = (
  message?: Message,
  extraMessages: Message[] = [],
) => {
  const { message_id, reply_to_message } = message ?? {}
  const parsedText = getParsedText(getMessageText(message))

  const replyId = parsedText
    ? message_id || 0
    : (reply_to_message?.message_id ?? message_id ?? 0)
  const quoteText = message?.quote?.text
  const replyTargetText = getMessageText(reply_to_message)
  const text = parsedText || quoteText || replyTargetText || ''
  const messageText = parsedText
  const replyText = quoteText || replyTargetText
  const combinedText =
    replyText && messageText ? `${replyText}\n${messageText}` : text

  const messagePhoto = getLargestPhoto(message)
  const replyPhoto = getLargestPhoto(reply_to_message)
  const extraPhotos = extraMessages.map(getLargestPhoto)

  const allImages = [messagePhoto, replyPhoto, ...extraPhotos].filter(
    (image) => image,
  )

  // Deduplicate by file_unique_id
  const uniqueImagesMap = new Map()
  for (const img of allImages) {
    if (!uniqueImagesMap.has(img.file_unique_id)) {
      uniqueImagesMap.set(img.file_unique_id, img)
    }
  }
  const images = Array.from(uniqueImagesMap.values())

  const sticker = reply_to_message?.sticker

  if (sticker) {
    images.push(sticker)
  }

  return { text, sticker, combinedText, images, replyId }
}

export const getLargestPhoto = (m?: Message) =>
  (m?.photo ?? []).slice().sort((a, b) => b.width - a.width)[0]

function getShortMessageText(message: Message | undefined): string {
  return getMessageText(message).trim().slice(0, 180)
}

function getMessageLabel(message: Message | undefined): string {
  const messageId = message?.message_id
  const text = getShortMessageText(message)
  return [
    typeof messageId === 'number' ? `message_id=${messageId}` : undefined,
    text ? `text=${JSON.stringify(text)}` : undefined,
  ]
    .filter(Boolean)
    .join(' | ')
}

export const getChatName = (chat?: Chat) => chat?.title || getUserName(chat)

// ── Media file refs ──────────────────────────────────────────

export interface MediaFileRef {
  fileId: string
  fileUniqueId?: string
  mimeType: string
  mediaType: 'image' | 'audio' | 'video'
  /** Source dimensions, when Telegram reports them. Used to match orientation. */
  width?: number
  height?: number
  /** Playback length in seconds, when Telegram reports it. */
  durationSeconds?: number
  label?: string
  context?: MediaMessageContext
}

const IMAGE_MIME_PREFIXES = ['image/']

/** Telegram omits dimensions for some media (voice, video notes, documents). */
function getDimensions(
  source: { width?: number; height?: number } | undefined,
): { width?: number; height?: number } {
  return source?.width && source.height
    ? { width: source.width, height: source.height }
    : {}
}

function getDuration(seconds: number | undefined): {
  durationSeconds?: number
} {
  return seconds ? { durationSeconds: seconds } : {}
}

function getMediaKey(ref: MediaFileRef): string {
  return ref.fileUniqueId ? `unique:${ref.fileUniqueId}` : `id:${ref.fileId}`
}

function getMediaKindLabel(ref: MediaFileRef): string {
  if (ref.mediaType === 'audio') return 'audio'
  if (ref.mediaType === 'video') return 'video'
  if (ref.mimeType === 'image/webp') return 'sticker'
  return 'image'
}

function isImageDocument(
  doc: { mime_type?: string; file_id?: string } | undefined,
): doc is { mime_type: string; file_id: string } {
  if (!doc?.file_id || !doc.mime_type) return false
  return IMAGE_MIME_PREFIXES.some((prefix) => doc.mime_type?.startsWith(prefix))
}

/**
 * Media carried by a single message, in a stable order:
 * photo, sticker, document (image only), voice, video, video_note, animation.
 */
function collectSingleMessageMediaFileRefs(
  message: Message | undefined,
): MediaFileRef[] {
  if (!message) return []

  const refs: MediaFileRef[] = []
  const photo = getLargestPhoto(message)

  if (photo?.file_id) {
    refs.push({
      fileId: photo.file_id,
      fileUniqueId: photo.file_unique_id,
      mimeType: 'image/jpeg',
      mediaType: 'image',
      ...getDimensions(photo),
    })
  }

  // Skip animated (.tgs/Lottie); handle video (.webm) and raster (.webp)
  const sticker = message.sticker as
    | (typeof message.sticker & { is_animated?: boolean; is_video?: boolean })
    | undefined
  if (sticker?.file_id && !sticker.is_animated) {
    refs.push({
      fileId: sticker.file_id,
      fileUniqueId: sticker.file_unique_id,
      mimeType: sticker.is_video ? 'video/webm' : 'image/webp',
      mediaType: sticker.is_video ? 'video' : 'image',
      ...getDimensions(sticker),
    })
  }

  if (isImageDocument(message.document)) {
    refs.push({
      fileId: message.document.file_id,
      ...(message.document.file_unique_id
        ? { fileUniqueId: message.document.file_unique_id }
        : {}),
      mimeType: message.document.mime_type,
      mediaType: 'image',
      ...getDimensions(message.document.thumbnail),
    })
  }

  if (message.voice?.file_id) {
    refs.push({
      fileId: message.voice.file_id,
      ...(message.voice.file_unique_id
        ? { fileUniqueId: message.voice.file_unique_id }
        : {}),
      mimeType: message.voice.mime_type || 'audio/ogg',
      mediaType: 'audio',
    })
  }

  if (message.video?.file_id) {
    refs.push({
      fileId: message.video.file_id,
      ...(message.video.file_unique_id
        ? { fileUniqueId: message.video.file_unique_id }
        : {}),
      mimeType: message.video.mime_type || 'video/mp4',
      mediaType: 'video',
      ...getDimensions(message.video),
      ...getDuration(message.video.duration),
    })
  }

  if (message.video_note?.file_id) {
    refs.push({
      fileId: message.video_note.file_id,
      ...(message.video_note.file_unique_id
        ? { fileUniqueId: message.video_note.file_unique_id }
        : {}),
      mimeType: 'video/mp4',
      mediaType: 'video',
      ...getDuration(message.video_note.duration),
    })
  }

  // Telegram delivers GIFs as silent MP4 animations; only genuine .gif files
  // keep an image mime type.
  if (message.animation?.file_id) {
    const mimeType = message.animation.mime_type || 'video/mp4'
    refs.push({
      fileId: message.animation.file_id,
      ...(message.animation.file_unique_id
        ? { fileUniqueId: message.animation.file_unique_id }
        : {}),
      mimeType,
      mediaType: mimeType.startsWith('image/') ? 'image' : 'video',
      ...getDimensions(message.animation),
      ...getDuration(message.animation.duration),
    })
  }

  return refs
}

/** Media attached directly to one stored Telegram message. */
export function getMessageMediaRefs(message: Message): MediaFileRef[] {
  const refs: MediaFileRef[] = []
  appendMediaRefs(
    refs,
    new Set<string>(),
    message,
    'History message',
    'history-message',
  )
  return refs
}

function appendMediaRefs(
  refs: MediaFileRef[],
  seen: Set<string>,
  sourceMessage: Message | undefined,
  sourceLabel: string,
  relation: MediaMessageRelation,
  referencedBy?: Message,
) {
  const messageLabel = getMessageLabel(sourceMessage) || `source=${sourceLabel}`
  const referenceLabel = getMessageLabel(referencedBy)
  const context: MediaMessageContext = {
    relation,
    ...(typeof sourceMessage?.message_id === 'number'
      ? { messageId: sourceMessage.message_id }
      : {}),
    ...(getShortMessageText(sourceMessage)
      ? { text: getShortMessageText(sourceMessage) }
      : {}),
    ...(sourceMessage?.from ? { author: getUserName(sourceMessage.from) } : {}),
    ...(typeof referencedBy?.message_id === 'number'
      ? { referencedByMessageId: referencedBy.message_id }
      : {}),
    ...(getShortMessageText(referencedBy)
      ? { referencedByText: getShortMessageText(referencedBy) }
      : {}),
    ...(referencedBy?.from
      ? { referencedByAuthor: getUserName(referencedBy.from) }
      : {}),
  }

  for (const ref of collectSingleMessageMediaFileRefs(sourceMessage)) {
    const key = getMediaKey(ref)
    if (seen.has(key)) continue

    seen.add(key)
    refs.push({
      ...ref,
      label: `${sourceLabel} ${getMediaKindLabel(ref)} (${[
        messageLabel,
        referenceLabel ? `referenced by ${referenceLabel}` : undefined,
      ]
        .filter(Boolean)
        .join(' | ')})`,
      context,
    })
  }
}

export function getCommandMediaRefs(
  message: Message | undefined,
  extraMessages: Message[] = [],
): MediaFileRef[] {
  const refs: MediaFileRef[] = []
  const seen = new Set<string>()
  const currentMediaGroupId = message?.media_group_id
  const replyMessage = message?.reply_to_message
  const replyMediaGroupId = replyMessage?.media_group_id

  appendMediaRefs(refs, seen, message, 'Current command', 'current-message')
  appendMediaRefs(
    refs,
    seen,
    replyMessage,
    'Reply message',
    'reply-target',
    message,
  )

  for (const extraMessage of extraMessages) {
    const [source, relation] =
      currentMediaGroupId && extraMessage.media_group_id === currentMediaGroupId
        ? (['Current command album', 'current-album'] as const)
        : replyMediaGroupId && extraMessage.media_group_id === replyMediaGroupId
          ? (['Reply message album', 'reply-album'] as const)
          : (['Related album', 'related-album'] as const)

    appendMediaRefs(refs, seen, extraMessage, source, relation)
  }

  return refs
}

/**
 * Collect media file references from a message and its reply context,
 * deduplicated against initialRefs.
 */
export function collectMediaFileRefs(
  message: Message | undefined,
  initialRefs: MediaFileRef[] = [],
): MediaFileRef[] {
  if (!message) return initialRefs

  const refs: MediaFileRef[] = [...initialRefs]
  const seen = new Set(initialRefs.map(getMediaKey))

  for (const ref of [
    ...collectSingleMessageMediaFileRefs(message),
    ...collectSingleMessageMediaFileRefs(message.reply_to_message),
  ]) {
    const key = getMediaKey(ref)
    if (seen.has(key)) continue

    seen.add(key)
    refs.push(ref)
  }

  return refs
}

// ── Multi-media support ──────────────────────────────────────

/** Maximum file size for inline Gemini input (19 MB to stay under 20 MB API limit) */
const MAX_INLINE_BYTES = 19 * 1024 * 1024

export interface MediaBuffer {
  buffer: Buffer
  mimeType: string
  mediaType: 'image' | 'audio' | 'video'
  origin?: 'request' | 'history'
  fileId?: string
  fileUniqueId?: string
  width?: number
  height?: number
  durationSeconds?: number
  label?: string
  context?: MediaMessageContext
}

export type MediaMessageRelation =
  | 'current-message'
  | 'reply-target'
  | 'current-album'
  | 'reply-album'
  | 'related-album'
  | 'history-message'

export interface MediaMessageContext {
  relation: MediaMessageRelation
  messageId?: number
  text?: string
  author?: string
  referencedByMessageId?: number
  referencedByText?: string
  referencedByAuthor?: string
}

/**
 * Resolve all media from a message (photo, sticker, document-image, voice, video, video_note)
 * into downloaded buffers with MIME info for Gemini multimodal input.
 */
export async function getMultimodalMediaData(
  ctx: Context,
  extraMessages: Message[] = [],
): Promise<{
  combinedText: string
  mediaBuffers: MediaBuffer[]
  replyId: number
  chatId: number | string
  message: Message | undefined
}> {
  const { combinedText, replyId } = getCommandData(ctx.message, extraMessages)
  const chatId = ctx?.chat?.id ?? ''

  const refs = getCommandMediaRefs(ctx.message, extraMessages)

  const mediaBuffers = await resolveMediaBuffers(refs, ctx.api)

  return { combinedText, mediaBuffers, replyId, chatId, message: ctx.message }
}

export type MediaResolverApi = Pick<Api, 'getFile'>

export async function resolveMediaBuffers(
  refs: MediaFileRef[],
  api: MediaResolverApi,
): Promise<MediaBuffer[]> {
  const token = process.env.TOKEN
  if (!token) {
    logger.warn(
      'resolveMediaBuffers: TOKEN env var is not set, skipping all media downloads',
    )
    return []
  }

  const results = await Promise.allSettled(
    refs.map(async (ref): Promise<MediaBuffer | undefined> => {
      const file = await api.getFile(ref.fileId)
      const filePath = (file as { file_path?: string }).file_path
      if (!filePath) return undefined

      const url = `https://api.telegram.org/file/bot${token}/${filePath}`
      const res = await fetch(url)

      if (!res.ok) {
        logger.warn(
          `Skipping file ${ref.fileId}: HTTP ${res.status} ${res.statusText}`,
        )
        return undefined
      }

      const arrayBuffer = await res.arrayBuffer()

      if (arrayBuffer.byteLength > MAX_INLINE_BYTES) {
        logger.warn(
          `Skipping file ${ref.fileId}: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB exceeds limit`,
        )
        return undefined
      }

      return {
        buffer: Buffer.from(arrayBuffer),
        mimeType: ref.mimeType,
        mediaType: ref.mediaType,
        fileId: ref.fileId,
        fileUniqueId: ref.fileUniqueId,
        ...getDimensions(ref),
        ...getDuration(ref.durationSeconds),
        label: ref.label,
        context: ref.context,
      }
    }),
  )

  const buffers: MediaBuffer[] = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status === 'fulfilled' && r.value) {
      buffers.push(r.value)
    } else if (r.status === 'rejected') {
      logger.warn(
        {
          err:
            r.reason instanceof Error ? r.reason : new Error(String(r.reason)),
          fileId: refs[i]?.fileId,
        },
        `resolveMediaBuffers: download failed for ${refs[i]?.fileId}`,
      )
    }
  }
  return buffers
}
