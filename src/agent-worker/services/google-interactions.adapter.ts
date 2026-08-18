type JsonRecord = Record<string, unknown>

interface LyriaInteractionOutput {
  buffer: Buffer
  mimeType: string
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
    text: text || undefined,
  }
}
