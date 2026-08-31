import type { Message } from 'grammy/types'

/**
 * Messages sent with sendRichMessage come back with their content in
 * `rich_message.blocks` and no `text`/`caption`, so every plain-text reader has
 * to flatten the block tree. Walking it structurally keeps one small function
 * total over all current and future block and entity variants.
 */

type RichNode = Record<string, unknown>

function asRichNode(value: unknown): RichNode | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RichNode)
    : undefined
}

/** Inline rich text: a string, a list of rich text, or an entity wrapper. */
function flattenRichText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(flattenRichText).join('')

  const node = asRichNode(value)
  if (!node) return ''
  if (typeof node.alternative_text === 'string') return node.alternative_text
  if (typeof node.expression === 'string') return node.expression
  return flattenRichText(node.text)
}

/** Block tree: paragraphs, headings, lists, quotes, tables and media captions. */
function flattenRichBlocks(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(flattenRichBlocks).filter(Boolean).join('\n')
  }

  const node = asRichNode(value)
  if (!node) return ''

  return [
    flattenRichText(node.summary),
    flattenRichText(node.text ?? node.expression),
    flattenRichBlocks(node.blocks ?? node.items ?? node.cells),
    flattenRichText(asRichNode(node.caption)?.text ?? node.caption),
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Plain text of a message, including rich messages. Without the rich fallback
 * every bot reply reads as empty in chat history and as `[media]` when it is a
 * reply target.
 */
export function getMessageText(message?: Message): string {
  return (
    message?.text ||
    message?.caption ||
    flattenRichBlocks(message?.rich_message?.blocks).trim()
  )
}
