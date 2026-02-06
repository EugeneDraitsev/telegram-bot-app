import type { Message } from 'telegram-typings'

import { cleanGeminiMessage } from '@tg-bot/common'
import type { AgentResponse } from '../types'

export const TOOL_COLLECTION_RULES = `TOOL COLLECTION MODE:
- Collect all data/media you need using tools (you can call multiple tools).
- Do NOT answer the user yet.
- If you're not sure the message is for you or replying is inappropriate, call do_nothing.
- If no tools are needed, just stop (no tool calls).`

export const FINAL_RESPONSE_RULES = `FINAL RESPONSE MODE:
- Compose ONE coherent message for the user based on the collected data.
- Do NOT mention tools or internal notes.
- If media is being sent, keep text short unless the user asked for details.
- If there's nothing to say, return an empty string.`

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
