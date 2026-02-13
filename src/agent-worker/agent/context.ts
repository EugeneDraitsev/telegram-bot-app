import type { Message } from 'telegram-typings'

import { cleanGeminiMessage } from '@tg-bot/common'
import type { AgentResponse } from '../types'

export const TOOL_COLLECTION_RULES = `TOOL COLLECTION MODE:
- Collect all data/media you need using tools (you can call multiple tools).
- Do NOT answer the user yet.
- Only the current user message is actionable.
- Chat history is NOT preloaded. If needed, explicitly call get_chat_history.
- If you're not sure the message is for you or replying is inappropriate, call do_nothing.
- Do not repeat the same search tool with the same intent multiple times.
- Call create_dynamic_tool only when the current message explicitly asks for reusable automation/tooling.
- If no tools are needed, just stop (no tool calls).`

export const FINAL_RESPONSE_RULES = `FINAL RESPONSE MODE:
- Compose ONE coherent message for the user based on the collected data.
- Answer only the current user request. Do not fulfill old requests from history.
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
