import type { Message } from 'telegram-typings'

import { cleanGeminiMessage } from '@tg-bot/common'
import type { AgentResponse } from '../types'

export function buildContextBlock(
  message: Message,
  textContent: string,
  hasImages: boolean,
): string {
  const lines = [
    'CONTEXT:',
    `- User: ${message.from?.first_name || 'Unknown'} (@${message.from?.username || 'no username'})`,
    `- Chat type: ${message.chat?.type || 'unknown'}`,
    `- Message: "${textContent}"`,
    `- Has attached images: ${hasImages}`,
  ]

  if (message.reply_to_message) {
    lines.push(
      `- Replying to: "${message.reply_to_message.text || message.reply_to_message.caption || '[media]'}"`,
    )
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
