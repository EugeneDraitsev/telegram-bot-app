import type { Context } from 'grammy/web'
import type { Chat, Message, MessageEntity, User } from 'telegram-typings'

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
      console.warn('getFile error: ', result.reason)
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
        console.error(error)
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
    if (sticker?.file_id) {
      if (sticker.is_animated) {
        // Lottie-based .tgs stickers — Gemini can't process these, skip
      } else if (sticker.is_video) {
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

  const mediaBuffers = await resolveMediaBuffers(refs, ctx)

  return { combinedText, mediaBuffers, replyId, chatId, message: ctx.message }
}

async function resolveMediaBuffers(
  refs: MediaFileRef[],
  ctx: Context,
): Promise<MediaBuffer[]> {
  const results = await Promise.allSettled(
    refs.map(async (ref): Promise<MediaBuffer | undefined> => {
      const file = await ctx.api.getFile(ref.fileId)
      const filePath = (file as { file_path?: string }).file_path
      if (!filePath) return undefined

      const url = `https://api.telegram.org/file/bot${process.env.TOKEN || ''}/${filePath}`
      const res = await fetch(url)

      if (!res.ok) {
        console.warn(
          `Skipping file ${ref.fileId}: HTTP ${res.status} ${res.statusText}`,
        )
        return undefined
      }

      const arrayBuffer = await res.arrayBuffer()

      if (arrayBuffer.byteLength > MAX_INLINE_BYTES) {
        console.warn(
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
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      buffers.push(r.value)
    } else if (r.status === 'rejected') {
      console.warn('resolveMediaBuffers: file download failed', r.reason)
    }
  }
  return buffers
}
