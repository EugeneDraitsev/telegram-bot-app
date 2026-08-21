import type { Message } from 'grammy/types'

import { cleanModelMessage, type MediaBuffer } from '@tg-bot/common'
import type { AgentResponse } from '../types'

interface BuildContextOptions {
  recentHistory?: string
}

export function buildContextBlock(
  message: Message,
  textContent: string,
  hasMedia: boolean,
  mediaBuffers?: MediaBuffer[],
  options: BuildContextOptions = {},
): string {
  const currentDate = new Date().toLocaleDateString('sv-SE', {
    timeZone: 'Europe/Stockholm',
  })

  // Build media summary
  let mediaSummary = String(hasMedia)
  if (mediaBuffers?.length) {
    const counts: Record<string, number> = {}
    for (const m of mediaBuffers) {
      counts[m.mediaType] = (counts[m.mediaType] || 0) + 1
    }
    mediaSummary = Object.entries(counts)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ')
  }
  const lines = [
    'CONTEXT:',
    `- Current date (Europe/Stockholm): ${currentDate}`,
    `- User: ${message.from?.first_name || 'Unknown'} (@${message.from?.username || 'no username'})`,
    `- Chat type: ${message.chat?.type || 'unknown'}`,
    `- Message: "${textContent}"`,
    `- Has attached media: ${mediaSummary}`,
  ]

  if (mediaBuffers?.length) {
    lines.push(
      '- Media formatting: the user input contains ordered MESSAGE_CONTEXT blocks followed by their MEDIA items. Each MEDIA has a stable 1-based media_id for generation tools.',
    )
  }

  if (message.reply_to_message) {
    const replyTarget = message.reply_to_message
    const replyText = replyTarget.text || replyTarget.caption || '[media]'
    const replyLabel =
      typeof replyTarget.message_id === 'number'
        ? `message_id=${replyTarget.message_id}`
        : 'message_id=unknown'
    const quoteText = message.quote?.text
    if (quoteText) {
      lines.push(
        `- Telegram reply target (${replyLabel}): "${replyText}"`,
        `- Quoted fragment from reply target: "${quoteText}"`,
      )
    } else {
      lines.push(`- Telegram reply target (${replyLabel}): "${replyText}"`)
    }
    lines.push(
      '- Reply rule: answer the current user message about this reply target first. Treat recent history as background unless the user explicitly asks about other messages.',
      '- Media priority: if the reply target has media, inspect explicitly labeled Reply message media. Historical images are available only after selecting their exact message_id with load_chat_media.',
    )
  }

  if (options.recentHistory) {
    lines.push(`- Recent chat history:\n${options.recentHistory}`)
  }

  return lines.join('\n')
}

export function buildMemoryBlock(
  chatMemory: string,
  globalMemory: string,
): string {
  const lines = ['MEMORY:']

  lines.push(`- Chat memory:\n${chatMemory || '(empty)'}`)
  lines.push(`- Global memory:\n${globalMemory || '(empty)'}`)

  return lines.join('\n')
}

export function splitResponses(responses: AgentResponse[]) {
  const textDrafts: string[] = []
  const mediaResponses: AgentResponse[] = []

  for (const response of responses) {
    if (response.type === 'text') {
      textDrafts.push(cleanModelMessage(response.text))
      continue
    }
    mediaResponses.push(response)
  }

  return { textDrafts, mediaResponses }
}
