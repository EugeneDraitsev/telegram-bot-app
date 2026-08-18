import type { MediaBuffer } from '@tg-bot/common'

type MediaType = MediaBuffer['mediaType']

export interface ToolMediaSelection {
  media: MediaBuffer[]
  explicit: boolean
}

export function getMediaIdsParameter(supportedMedia: string) {
  return {
    type: 'array' as const,
    items: { type: 'integer' as const, minimum: 1 },
    uniqueItems: true,
    description: `1-based media_id values from the structured MEDIA_CONTEXT to use as ${supportedMedia}. Select only media the user refers to by attachment, reply, message text, recency, or visible content. Omit this field to use current/reply/album media only. Pass an empty array for text-only generation. Never select history media merely because it is available.`,
  }
}

function parseMediaIds(value: unknown): number[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new Error('mediaIds must be an array of media_id numbers')
  }

  const ids = value.map((item) => {
    if (typeof item !== 'number' || !Number.isInteger(item) || item < 1) {
      throw new Error('mediaIds must contain only positive integers')
    }
    return item
  })
  return [...new Set(ids)]
}

export function selectMediaForTool(
  mediaBuffers: MediaBuffer[] | undefined,
  mediaIds: unknown,
  supportedTypes: readonly MediaType[],
): ToolMediaSelection {
  const media = mediaBuffers ?? []
  const supported = new Set(supportedTypes)
  const ids = parseMediaIds(mediaIds)

  if (ids === undefined) {
    return {
      media: media.filter(
        (item) => item.origin !== 'history' && supported.has(item.mediaType),
      ),
      explicit: false,
    }
  }

  return {
    media: ids.map((mediaId) => {
      const item = media[mediaId - 1]
      if (!item) {
        const available = media.length ? `1-${media.length}` : 'none'
        throw new Error(
          `Unknown media_id ${mediaId}; available media_id range is ${available}`,
        )
      }
      if (!supported.has(item.mediaType)) {
        throw new Error(
          `media_id ${mediaId} is ${item.mediaType}, but this tool supports ${supportedTypes.join(' or ')}`,
        )
      }
      return item
    }),
    explicit: true,
  }
}
