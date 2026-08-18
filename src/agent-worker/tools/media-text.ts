const MAX_MEDIA_CAPTION_LENGTH = 300
const MAX_TRACK_TITLE_LENGTH = 64

function getMediaText(value: unknown, maxLength: number): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return undefined
  return text.replace(/\s+/g, ' ').slice(0, maxLength).trim() || undefined
}

export function getMediaCaption(value: unknown): string | undefined {
  return getMediaText(value, MAX_MEDIA_CAPTION_LENGTH)
}

export function getTrackTitle(value: unknown): string | undefined {
  return getMediaText(value, MAX_TRACK_TITLE_LENGTH)
}
