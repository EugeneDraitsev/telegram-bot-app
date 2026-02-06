import type { DynamicStructuredTool } from '@langchain/core/tools'

import { TOOL_NAMES } from '../tools'
import type { AgentChatMessage } from '../types'
import { MAX_TOOL_ITERATIONS } from './config'
import { TOOL_COLLECTION_RULES } from './context'
import { chatModel } from './models'
import { agentSystemInstructions } from './system-instructions'

export function buildCollectionMessages(params: {
  historyContext: AgentChatMessage[]
  contextBlock: string
  textContent: string
}): AgentChatMessage[] {
  const { historyContext, contextBlock, textContent } = params
  const collectionPrompt = `${agentSystemInstructions}

${TOOL_COLLECTION_RULES}

${contextBlock}`

  return [
    { role: 'system', content: collectionPrompt },
    ...historyContext,
    {
      role: 'human',
      content: textContent || '[User sent media without text]',
    },
  ]
}

export async function runToolCollection(params: {
  messages: AgentChatMessage[]
  tools: DynamicStructuredTool[]
}) {
  const { messages, tools } = params
  const toolNotes: string[] = []

  if (tools.length === 0) {
    return { toolNotes, shouldSkip: false }
  }

  const collectionTools = tools.filter(
    (tool) => tool.name !== TOOL_NAMES.SEND_TEXT,
  )
  const toolByName = new Map<string, DynamicStructuredTool>(
    tools.map((tool) => [tool.name, tool]),
  )
  const collectionModel = chatModel.bindTools(collectionTools)

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const result = await collectionModel.invoke(messages)
    const toolCalls = result.tool_calls ?? []
    if (toolCalls.length === 0) {
      break
    }

    const roundNotes: string[] = []
    for (const toolCall of toolCalls) {
      const tool = toolByName.get(toolCall.name)
      if (!tool) {
        roundNotes.push(`${toolCall.name}: Tool not found`)
        continue
      }

      try {
        // biome-ignore lint/suspicious/noExplicitAny: tool args come from model
        const toolResult = await (tool as any).invoke(toolCall.args)
        roundNotes.push(`${toolCall.name}: ${toolResult}`)
      } catch (error) {
        console.error(`[Agent] Tool error (${toolCall.name}):`, error)
        roundNotes.push(`${toolCall.name}: Error - ${error}`)
      }
    }

    toolNotes.push(...roundNotes)

    if (toolCalls.some((toolCall) => toolCall.name === TOOL_NAMES.DO_NOTHING)) {
      return { toolNotes, shouldSkip: true }
    }

    messages.push({
      role: 'assistant',
      content: `Tool results:\n${roundNotes.join('\n')}`,
    })
    messages.push({
      role: 'human',
      content: 'Need more tools? If yes, call them. If no, stop.',
    })
  }

  return { toolNotes, shouldSkip: false }
}
