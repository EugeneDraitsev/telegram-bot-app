import { cleanGeminiMessage, systemInstructions } from '@tg-bot/common'
import type { AgentChatMessage } from '../types'
import { FINAL_RESPONSE_RULES } from './context'
import { chatModel } from './models'

const COMPOSE_TIMEOUT_MS = 30_000

export async function composeFinalText(params: {
  contextBlock: string
  memoryBlock?: string
  textContent: string
  toolNotes: string[]
  textDrafts: string[]
  hasMedia: boolean
}): Promise<string> {
  const {
    contextBlock,
    memoryBlock,
    textContent,
    toolNotes,
    textDrafts,
    hasMedia,
  } = params

  // If we only have media and no text drafts, no need for an extra model call.
  if (hasMedia && textDrafts.length === 0) {
    return ''
  }

  const systemParts = [systemInstructions, FINAL_RESPONSE_RULES, contextBlock]
  if (memoryBlock) {
    systemParts.push(memoryBlock)
  }
  const finalSystemPrompt = systemParts.join('\n\n')

  const finalPrompt = [
    `User message: "${textContent || '[User sent media without text]'}"`,
    textDrafts.length ? `Draft tool texts:\n${textDrafts.join('\n\n')}` : '',
    toolNotes.length ? `Tool notes:\n${toolNotes.join('\n')}` : '',
    hasMedia ? 'Media prepared: yes' : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const finalMessages: AgentChatMessage[] = [
    { role: 'system', content: finalSystemPrompt },
    { role: 'human', content: finalPrompt },
  ]

  const result = await chatModel.invoke(finalMessages, {
    timeout: COMPOSE_TIMEOUT_MS,
  })
  if (typeof result.content !== 'string' || !result.content.trim()) {
    return ''
  }

  return cleanGeminiMessage(result.content)
}
