import type { Message } from 'telegram-typings'

import { getLargestPhoto } from './telegram.utils'

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
  message: Message,
  initialRefs: MediaFileRef[] = [],
): MediaFileRef[] {
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

    // Stickers (treat as images)
    if (m.sticker?.file_id) {
      add({
        fileId: m.sticker.file_id,
        mimeType: 'image/webp',
        mediaType: 'image',
      })
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
