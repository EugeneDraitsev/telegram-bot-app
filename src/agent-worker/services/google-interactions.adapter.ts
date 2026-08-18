type JsonRecord = Record<string, unknown>
const MAX_ERROR_DETAIL_LENGTH = 300

export interface LyriaInteractionOutput {
  buffer: Buffer
  mimeType: string
  interactionId?: string
  text?: string
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * The AI SDK Google provider does not yet expose Omni's video response format.
 * Keep the provider request intact and add only the missing documented format.
 */
export function adaptOmniInteractionRequest(
  value: unknown,
  aspectRatio: '9:16' | '16:9',
  durationSeconds: number,
): JsonRecord {
  if (!isRecord(value)) {
    throw new Error('Google Interactions request body must be a JSON object')
  }
  if ('responseFormat' in value) {
    throw new Error(
      'Google Interactions request unexpectedly used camelCase responseFormat',
    )
  }

  // The wire schema requires an array. Preserve the SDK array and normalize a
  // single legacy entry defensively so adding video never overwrites it.
  const existingFormats = Array.isArray(value.response_format)
    ? value.response_format
    : value.response_format === undefined
      ? []
      : [value.response_format]
  const videoFormat = {
    type: 'video',
    aspect_ratio: aspectRatio,
    duration: `${durationSeconds}s`,
    delivery: 'inline',
  }
  const responseFormats = existingFormats.some(
    (format) => isRecord(format) && format.type === 'video',
  )
    ? existingFormats.map((format) =>
        isRecord(format) && format.type === 'video'
          ? { ...format, ...videoFormat }
          : format,
      )
    : [...existingFormats, videoFormat]

  return {
    ...value,
    response_format: responseFormats,
  }
}

function getResponseErrorDetail(responseBody: string): string | undefined {
  const trimmed = responseBody.trim()
  if (!trimmed) return undefined

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!isRecord(parsed)) return trimmed.slice(0, MAX_ERROR_DETAIL_LENGTH)
    const apiError = isRecord(parsed.error) ? parsed.error : undefined
    const message =
      apiError && typeof apiError.message === 'string'
        ? apiError.message
        : undefined
    const details = apiError?.details ?? parsed.errors
    const detailsText = details === undefined ? '' : JSON.stringify(details)
    return [message, detailsText]
      .filter((part): part is string => Boolean(part))
      .join(' | ')
      .slice(0, MAX_ERROR_DETAIL_LENGTH)
  } catch {
    return trimmed.slice(0, MAX_ERROR_DETAIL_LENGTH)
  }
}

export function getGoogleInteractionErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (!isRecord(error) || typeof error.responseBody !== 'string') {
    return message
  }

  const detail = getResponseErrorDetail(error.responseBody)
  return detail && detail !== message ? `${message}: ${detail}` : message
}

function getOutputBlocks(body: JsonRecord): JsonRecord[] {
  if (Array.isArray(body.outputs)) return body.outputs.filter(isRecord)
  if (!Array.isArray(body.steps)) return []

  return body.steps.flatMap((step) => {
    if (!isRecord(step) || step.type !== 'model_output') return []
    return Array.isArray(step.content) ? step.content.filter(isRecord) : []
  })
}

export function extractLyriaInteractionOutput(
  value: unknown,
): LyriaInteractionOutput | undefined {
  if (!isRecord(value)) return undefined
  const blocks = getOutputBlocks(value)
  const audio = blocks.findLast(
    (block) => block.type === 'audio' && typeof block.data === 'string',
  )
  if (!audio || typeof audio.data !== 'string') return undefined

  const buffer = Buffer.from(audio.data, 'base64')
  if (!buffer.byteLength) return undefined
  const text = blocks
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('\n\n')
    .trim()

  return {
    buffer,
    mimeType:
      typeof audio.mime_type === 'string' ? audio.mime_type : 'audio/mpeg',
    interactionId: typeof value.id === 'string' ? value.id : undefined,
    text: text || undefined,
  }
}
