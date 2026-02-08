import type { DynamicStructuredTool } from '@langchain/core/tools'

import { getErrorMessage } from '@tg-bot/common'
import { logger } from '../logger'
import { getAgentTools, TOOL_NAMES } from '../tools'
import type { AgentChatMessage } from '../types'
import { MAX_TOOL_ITERATIONS } from './config'
import { TOOL_COLLECTION_RULES } from './context'
import { chatModel } from './models'
import { agentSystemInstructions } from './system-instructions'

const DEFAULT_MAX_CALLS_PER_TOOL = 2
const MAX_CALLS_PER_TOOL: Record<string, number> = {
  [TOOL_NAMES.SEARCH_GIF]: 1,
}

function getCallLimit(toolName: string): number {
  return MAX_CALLS_PER_TOOL[toolName] ?? DEFAULT_MAX_CALLS_PER_TOOL
}

function getCallKey(toolName: string, args: unknown): string {
  try {
    return `${toolName}:${JSON.stringify(args)}`
  } catch {
    return `${toolName}:[unserializable]`
  }
}

function toResultText(result: unknown): string {
  if (typeof result === 'string') {
    return result
  }
  if (result == null) {
    return 'ok'
  }
  try {
    return JSON.stringify(result)
  } catch {
    return 'ok'
  }
}

function toErrorText(error: unknown): string {
  return getErrorMessage(error)
}

function mergeTools(
  currentTools: DynamicStructuredTool[],
  refreshedTools: DynamicStructuredTool[],
): DynamicStructuredTool[] {
  const merged = new Map<string, DynamicStructuredTool>()
  for (const tool of currentTools) {
    merged.set(tool.name, tool)
  }
  for (const tool of refreshedTools) {
    merged.set(tool.name, tool)
  }
  return [...merged.values()]
}

function bindCollectionModel(tools: DynamicStructuredTool[]) {
  return chatModel.bindTools(tools)
}

export function buildCollectionMessages(params: {
  contextBlock: string
  textContent: string
}): AgentChatMessage[] {
  const { contextBlock, textContent } = params

  return [
    {
      role: 'system',
      content: `${agentSystemInstructions}

${TOOL_COLLECTION_RULES}

${contextBlock}`,
    },
    {
      role: 'human',
      content: textContent || '[User sent media without text]',
    },
  ]
}

export async function runToolCollection(params: {
  messages: AgentChatMessage[]
  tools: DynamicStructuredTool[]
  chatId: number
}) {
  const { messages, chatId } = params
  const toolNotes: string[] = []

  if (params.tools.length === 0) {
    return { toolNotes, shouldSkip: false }
  }

  let tools = [...params.tools]
  let collectionModel = bindCollectionModel(tools)
  let toolByName = new Map(tools.map((tool) => [tool.name, tool]))
  const callCounts = new Map<string, number>()
  const callSignatures = new Set<string>()

  for (let iteration = 1; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
    let result: Awaited<ReturnType<typeof collectionModel.invoke>>
    try {
      result = await collectionModel.invoke(messages, { timeout: 15_000 })
    } catch (error) {
      logger.error({ chatId, iteration, error }, 'tool.collection_failed')
      break
    }

    const toolCalls = result.tool_calls ?? []
    if (toolCalls.length === 0) {
      break
    }

    const roundNotes: string[] = []
    let executedCount = 0
    let shouldRefreshTools = false

    for (const toolCall of toolCalls) {
      if (toolCall.name === TOOL_NAMES.DO_NOTHING) {
        return { toolNotes: [...toolNotes, ...roundNotes], shouldSkip: true }
      }

      const callCount = (callCounts.get(toolCall.name) ?? 0) + 1
      if (callCount > getCallLimit(toolCall.name)) {
        roundNotes.push(`${toolCall.name}: skipped (call limit reached)`)
        continue
      }

      const callKey = getCallKey(toolCall.name, toolCall.args)
      if (callSignatures.has(callKey)) {
        roundNotes.push(`${toolCall.name}: skipped (duplicate call)`)
        continue
      }

      callCounts.set(toolCall.name, callCount)
      callSignatures.add(callKey)

      const tool = toolByName.get(toolCall.name)
      if (!tool) {
        roundNotes.push(`${toolCall.name}: skipped (tool not found)`)
        continue
      }

      logger.info(
        {
          chatId,
          iteration,
          tool: toolCall.name,
          payload: toolCall.args,
        },
        'tool.call',
      )

      try {
        // biome-ignore lint/suspicious/noExplicitAny: tool args come from model
        const toolResult = await (tool as any).invoke(toolCall.args)
        roundNotes.push(`${toolCall.name}: ${toResultText(toolResult)}`)
        executedCount++
        logger.info(
          {
            chatId,
            iteration,
            tool: toolCall.name,
          },
          'tool.done',
        )
      } catch (error) {
        roundNotes.push(`${toolCall.name}: Error - ${toErrorText(error)}`)
        logger.error(
          {
            chatId,
            iteration,
            tool: toolCall.name,
            error,
          },
          'tool.failed',
        )
      }

      if (toolCall.name === TOOL_NAMES.CREATE_DYNAMIC_TOOL) {
        shouldRefreshTools = true
      }
    }

    toolNotes.push(...roundNotes)
    if (roundNotes.length > 0) {
      messages.push({
        role: 'assistant',
        content: `Tool results:\n${roundNotes.join('\n')}`,
      })
    }

    if (shouldRefreshTools) {
      try {
        tools = mergeTools(tools, await getAgentTools(chatId))
        collectionModel = bindCollectionModel(tools)
        toolByName = new Map(tools.map((tool) => [tool.name, tool]))
      } catch (error) {
        logger.error({ chatId, error }, 'tools.refresh_failed')
      }
    }

    if (executedCount === 0) {
      break
    }

    messages.push({
      role: 'human',
      content: 'Need more tools? If yes, call them. If no, stop.',
    })
  }

  return { toolNotes, shouldSkip: false }
}
