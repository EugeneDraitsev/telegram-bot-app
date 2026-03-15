import type { Message } from 'telegram-typings'

import {
  cleanGeminiMessage,
  type ExtendedMessage,
  type MediaBuffer,
} from '@tg-bot/common'
import type { AgentResponse } from '../types'

export function buildContextBlock(
  message: Message,
  textContent: string,
  hasMedia: boolean,
  mediaBuffers?: MediaBuffer[],
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

  if (message.reply_to_message) {
    const quoteText = (message as ExtendedMessage).quote?.text
    if (quoteText) {
      lines.push(
        `- Quoting a specific part of the message: "${quoteText}"`,
        `- Original message being replied to: "${message.reply_to_message.text || message.reply_to_message.caption || '[media]'}"`,
      )
    } else {
      lines.push(
        `- Replying to: "${message.reply_to_message.text || message.reply_to_message.caption || '[media]'}"`,
      )
    }
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
      textDrafts.push(cleanGeminiMessage(response.text))
      continue
    }
    mediaResponses.push(response)
  }

  return { textDrafts, mediaResponses }
}
