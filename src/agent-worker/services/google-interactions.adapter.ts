type JsonRecord = Record<string, unknown>

export interface LyriaInteractionOutput {
  buffer: Buffer
  mimeType: string
  interactionId?: string
  text?: string
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function unwrapSingleUserInput(value: unknown): unknown {
  if (!Array.isArray(value) || value.length !== 1) return value
  const step = value[0]
  return isRecord(step) &&
    step.type === 'user_input' &&
    Array.isArray(step.content)
    ? step.content
    : value
}

/**
 * The AI SDK Google provider does not yet expose Omni's video response format.
 * Keep using its Interactions model, but make the outgoing body match Google's
 * documented Omni request shape.
 */
export function adaptOmniInteractionRequest(
  value: unknown,
  aspectRatio: '9:16' | '16:9',
): unknown {
  if (!isRecord(value)) return value

  return {
    ...value,
    input: unwrapSingleUserInput(value.input),
    response_format: {
      type: 'video',
      aspect_ratio: aspectRatio,
      delivery: 'inline',
    },
    store: false,
  }
}

function getResponseErrorDetail(responseBody: string): string | undefined {
  const trimmed = responseBody.trim()
  if (!trimmed) return undefined

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!isRecord(parsed)) return trimmed.slice(0, 1_000)
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
      .slice(0, 1_000)
  } catch {
    return trimmed.slice(0, 1_000)
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
