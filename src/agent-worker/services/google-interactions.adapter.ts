type JsonRecord = Record<string, unknown>

interface InteractionMediaOutput {
  buffer: Buffer
  mimeType: string
}

interface LyriaInteractionOutput extends InteractionMediaOutput {
  text?: string
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getOutputBlocks(body: JsonRecord): JsonRecord[] {
  if (Array.isArray(body.outputs)) return body.outputs.filter(isRecord)
  if (!Array.isArray(body.steps)) return []

  return body.steps.flatMap((step) => {
    if (!isRecord(step) || step.type !== 'model_output') return []
    return Array.isArray(step.content) ? step.content.filter(isRecord) : []
  })
}

function findMediaOutput(
  blocks: JsonRecord[],
  type: 'audio' | 'video',
  fallbackMimeType: string,
): InteractionMediaOutput | undefined {
  const block = blocks.findLast(
    (item) => item.type === type && typeof item.data === 'string',
  )
  if (!block || typeof block.data !== 'string') return undefined

  const buffer = Buffer.from(block.data, 'base64')
  if (!buffer.byteLength) return undefined

  return {
    buffer,
    mimeType:
      typeof block.mime_type === 'string' ? block.mime_type : fallbackMimeType,
  }
}

export function extractOmniInteractionVideo(
  value: unknown,
): InteractionMediaOutput | undefined {
  if (!isRecord(value)) return undefined

  return findMediaOutput(getOutputBlocks(value), 'video', 'video/mp4')
}

export function extractLyriaInteractionOutput(
  value: unknown,
): LyriaInteractionOutput | undefined {
  if (!isRecord(value)) return undefined
  const blocks = getOutputBlocks(value)
  const audio = findMediaOutput(blocks, 'audio', 'audio/mpeg')
  if (!audio) return undefined

  const text = blocks
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('\n\n')
    .trim()

  return { ...audio, text: text || undefined }
}
