import type { Context } from 'grammy/web'
import type { Chat, Message, MessageEntity, User } from 'telegram-typings'

import { logger } from '../logger'
import type { ExtendedMessage } from '../types'

export const isLink = (text = '') => text.includes('https://')

export const findCommand = (text = ''): string =>
  text
    .replace(/(\r\n|\n|\r)/gm, '')
    .replace(/ .*/, '')
    .replace(/@.*/, '')

export const isBotCommand = (entities: MessageEntity[] = []): boolean =>
  entities.some((entity) => entity.type === 'bot_command')

export const getParsedText = (text = '') => {
  if (text.startsWith('/')) {
    return text.split(' ').slice(1).join(' ')
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
  const parsedText = getParsedText(message?.text || message?.caption)

  const replyId = parsedText
    ? message_id || 0
    : (reply_to_message?.message_id ?? message_id ?? 0)
  const quoteText = (message as ExtendedMessage)?.quote?.text
  const text =
    parsedText ||
    quoteText ||
    reply_to_message?.text ||
    reply_to_message?.caption ||
    ''
  const messageText = parsedText
  const replyText =
    quoteText || reply_to_message?.text || reply_to_message?.caption
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

export const getMultimodalCommandData = async (
  ctx: Context,
  extraMessages: Message[] = [],
) => {
  const { combinedText, images, replyId } = getCommandData(
    ctx.message,
    extraMessages,
  )
  const chatId = ctx?.chat?.id ?? ''

  const fileResults = await Promise.allSettled(
    images?.map((image) => ctx.api.getFile(image.file_id)) ?? [],
  )

  const files: Array<{ file_path?: string }> = []
  for (const result of fileResults) {
    if (result.status === 'fulfilled') {
      files.push(result.value as { file_path?: string })
    } else {
      logger.warn(
        {
          err:
            result.reason instanceof Error
              ? result.reason
              : new Error(String(result.reason)),
        },
        'getFile error',
      )
    }
  }

  const imagesUrls = files
    .map((file) =>
      file.file_path
        ? `https://api.telegram.org/file/bot${process.env.TOKEN || ''}/${file.file_path}`
        : undefined,
    )
    .filter((url): url is string => Boolean(url))

  const imagesData = await getImageBuffers(imagesUrls)

  return {
    combinedText,
    imagesData,
    replyId,
    chatId,
    message: ctx.message,
  }
}

export async function getImageBuffers(imagesUrls: string[]) {
  const imagesData = await Promise.all(
    imagesUrls.map(async (url) => {
      try {
        const res = await fetch(url)
        const arrayBuffer = await res.arrayBuffer()
        return Buffer.from(arrayBuffer)
      } catch (error) {
        logger.error(error)
        return undefined
      }
    }),
  )

  return imagesData.filter((image) => image) as Buffer[]
}

export const getChatName = (chat?: Chat) => chat?.title || getUserName(chat)

// ── Media file refs ──────────────────────────────────────────

export interface MediaFileRef {
  fileId: string
  mimeType: string
  mediaType: 'image' | 'audio' | 'video'
}

export interface HistoryMediaFileRef {
  ref: MediaFileRef
  message: Message
}

const IMAGE_MIME_PREFIXES = ['image/']

function isImageDocument(
  doc: { mime_type?: string; file_id?: string } | undefined,
): doc is { mime_type: string; file_id: string } {
  if (!doc?.file_id || !doc.mime_type) return false
  return IMAGE_MIME_PREFIXES.some((prefix) => doc.mime_type?.startsWith(prefix))
}

/**
 * Collect media file references from a message and its reply context.
 * Supports: photo, sticker, document (image), voice, video, video_note.
 */
export function collectMediaFileRefs(
  message: Message | undefined,
  initialRefs: MediaFileRef[] = [],
): MediaFileRef[] {
  if (!message) return initialRefs

  const refs: MediaFileRef[] = [...initialRefs]
  const seenIds = new Set(initialRefs.map((r) => r.fileId))

  function add(ref: MediaFileRef) {
    if (!seenIds.has(ref.fileId)) {
      seenIds.add(ref.fileId)
      refs.push(ref)
    }
  }

  function collectFromMessage(m: Message | undefined) {
    if (!m) return

    // Photos
    const photo = getLargestPhoto(m)
    if (photo?.file_id) {
      add({ fileId: photo.file_id, mimeType: 'image/jpeg', mediaType: 'image' })
    }

    // Stickers — skip animated (.tgs/Lottie), handle video (.webm) and raster (.webp)
    const sticker = m.sticker as
      | (typeof m.sticker & { is_animated?: boolean; is_video?: boolean })
      | undefined
    if (sticker?.file_id && !sticker.is_animated) {
      if (sticker.is_video) {
        add({
          fileId: sticker.file_id,
          mimeType: 'video/webm',
          mediaType: 'video',
        })
      } else {
        add({
          fileId: sticker.file_id,
          mimeType: 'image/webp',
          mediaType: 'image',
        })
      }
    }

    // Documents — only image types
    if (isImageDocument(m.document)) {
      add({
        fileId: m.document.file_id,
        mimeType: m.document.mime_type,
        mediaType: 'image',
      })
    }

    // Voice messages
    if (m.voice?.file_id) {
      add({
        fileId: m.voice.file_id,
        mimeType: m.voice.mime_type || 'audio/ogg',
        mediaType: 'audio',
      })
    }

    // Videos
    if (m.video?.file_id) {
      add({
        fileId: m.video.file_id,
        mimeType: m.video.mime_type || 'video/mp4',
        mediaType: 'video',
      })
    }

    // Video notes (round videos)
    if (m.video_note?.file_id) {
      add({
        fileId: m.video_note.file_id,
        mimeType: 'video/mp4',
        mediaType: 'video',
      })
    }
  }

  collectFromMessage(message)
  collectFromMessage(message.reply_to_message)

  return refs
}

export function collectHistoryMediaFileRefs(
  messages: Message[],
  options: {
    excludeMessageId?: number
    limit?: number
    mediaTypes?: MediaFileRef['mediaType'][]
  } = {},
): HistoryMediaFileRef[] {
  // History media intentionally includes each visible message's immediate
  // reply context so a recent reply can carry the replied-to media into
  // the model input as additional context.
  const visibleMessages =
    typeof options.excludeMessageId === 'number'
      ? messages.filter(
          (message) => message.message_id !== options.excludeMessageId,
        )
      : messages

  const limitedMessages = Number.isFinite(options.limit)
    ? visibleMessages.slice(-Math.max(Math.trunc(options.limit ?? 1), 1))
    : visibleMessages

  const allowedMediaTypes = options.mediaTypes?.length
    ? new Set(options.mediaTypes)
    : undefined
  const refsById = new Map<string, HistoryMediaFileRef>()

  for (const message of limitedMessages) {
    const refs = collectMediaFileRefs(message).filter(
      (ref) => !allowedMediaTypes || allowedMediaTypes.has(ref.mediaType),
    )

    for (const ref of refs) {
      if (!refsById.has(ref.fileId)) {
        refsById.set(ref.fileId, { ref, message })
      }
    }
  }

  return [...refsById.values()]
}

/**
 * Backwards-compatible: collect only image file IDs as flat strings.
 */
export function collectMessageImageFileIds(
  message: Message,
  initialFileIds: string[] = [],
): string[] {
  const ids = [
    ...initialFileIds,
    getLargestPhoto(message)?.file_id,
    getLargestPhoto(message.reply_to_message)?.file_id,
    message.reply_to_message?.sticker?.file_id,
  ].filter((id): id is string => Boolean(id))

  return [...new Set(ids)]
}

// ── Multi-media support ──────────────────────────────────────

/** Maximum file size for inline Gemini input (19 MB to stay under 20 MB API limit) */
const MAX_INLINE_BYTES = 19 * 1024 * 1024

export interface MediaBuffer {
  buffer: Buffer
  mimeType: string
  mediaType: 'image' | 'audio' | 'video'
}

export interface HistoryMediaAttachment {
  message: Message
  media: MediaBuffer
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

  // Collect all media refs from the message, reply, and album extras
  let refs = collectMediaFileRefs(ctx.message)
  for (const extra of extraMessages) {
    refs = collectMediaFileRefs(extra, refs)
  }

  const mediaBuffers = await resolveMediaBuffers(refs, ctx.api)

  return { combinedText, mediaBuffers, replyId, chatId, message: ctx.message }
}

type MediaResolverApi = {
  getFile: (fileId: string) => Promise<{ file_path?: string }>
}

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

export async function resolveHistoryMediaAttachments(
  entries: HistoryMediaFileRef[],
  api: MediaResolverApi,
): Promise<HistoryMediaAttachment[]> {
  const resolved = await Promise.all(
    entries.map(async (entry) => {
      const [media] = await resolveMediaBuffers([entry.ref], api)
      return media ? { message: entry.message, media } : undefined
    }),
  )

  return resolved.filter(
    (entry): entry is HistoryMediaAttachment => entry != null,
  )
}
