import { cleanGeminiMessage, systemInstructions } from '@tg-bot/common'
import type { AgentChatMessage } from '../types'
import { FINAL_RESPONSE_RULES } from './context'
import { chatModel } from './models'

export async function composeFinalText(params: {
  historyContext: AgentChatMessage[]
  contextBlock: string
  textContent: string
  toolNotes: string[]
  textDrafts: string[]
  hasMedia: boolean
}): Promise<string> {
  const {
    historyContext,
    contextBlock,
    textContent,
    toolNotes,
    textDrafts,
    hasMedia,
  } = params

  const finalSystemPrompt = `${systemInstructions}

${FINAL_RESPONSE_RULES}

${contextBlock}`

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
    ...historyContext,
    { role: 'human', content: finalPrompt },
  ]

  const result = await chatModel.invoke(finalMessages)
  if (typeof result.content !== 'string' || !result.content.trim()) {
    return ''
  }

  return cleanGeminiMessage(result.content)
}
