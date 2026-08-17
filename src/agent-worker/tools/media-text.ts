const MAX_MEDIA_CAPTION_LENGTH = 300
const MAX_TRACK_TITLE_LENGTH = 64

function getMediaText(
  value: unknown,
  fallback: string,
  maxLength: number,
): string {
  const text = typeof value === 'string' ? value.trim() : ''
  return (text || fallback.trim())
    .replace(/\s+/g, ' ')
    .slice(0, maxLength)
    .trim()
}

export function getMediaCaption(value: unknown, prompt: string): string {
  return getMediaText(value, prompt, MAX_MEDIA_CAPTION_LENGTH)
}

export function getTrackTitle(value: unknown, prompt: string): string {
  return getMediaText(value, prompt, MAX_TRACK_TITLE_LENGTH)
}
