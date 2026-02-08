/**
 * Tool for creating/updating dynamic tools in Redis.
 * Helps validate dynamic tool flow end-to-end from the agent itself.
 */

import { DynamicStructuredTool } from '@langchain/core/tools'

import {
  getDynamicToolsRawByScope,
  getErrorMessage,
  saveDynamicToolsRaw,
} from '@tg-bot/common'
import { logger } from '../logger'
import { requireToolContext } from './context'
import {
  type DynamicToolDefinition,
  dynamicToolDefinitionSchema,
} from './dynamic-tools'

const RESERVED_TOOL_NAMES = new Set<string>([
  'send_text',
  'search_image',
  'generate_or_edit_image',
  'search_video',
  'search_gif',
  'generate_voice',
  'get_weather',
  'web_search',
  'summarize_content',
  'get_chat_history',
  'do_nothing',
  'create_dynamic_tool',
])

function uniqueByName(tools: DynamicToolDefinition[]): DynamicToolDefinition[] {
  const byName = new Map<string, DynamicToolDefinition>()
  for (const tool of tools) {
    byName.set(tool.name, tool)
  }
  return [...byName.values()]
}

function parseDynamicToolList(rawTools: unknown[]): DynamicToolDefinition[] {
  const parsedTools: DynamicToolDefinition[] = []
  for (const rawTool of rawTools) {
    const parsed = dynamicToolDefinitionSchema.safeParse(rawTool)
    if (!parsed.success) {
      continue
    }
    parsedTools.push(parsed.data)
  }

  return uniqueByName(parsedTools)
}

export const createDynamicToolTool = new DynamicStructuredTool({
  name: 'create_dynamic_tool',
  description:
    'Create or update dynamic tool in Redis for current chat. Use only when the current user message explicitly asks for reusable automation.',
  schema: dynamicToolDefinitionSchema,
  func: async (input) => {
    const { message } = requireToolContext()
    const chatId = message.chat?.id
    if (!chatId) {
      return 'Error creating dynamic tool: Chat ID is missing'
    }

    const definition: DynamicToolDefinition = {
      ...input,
      enabled: input.enabled ?? true,
    }

    if (RESERVED_TOOL_NAMES.has(definition.name)) {
      return `Error creating dynamic tool: "${definition.name}" conflicts with built-in tool name`
    }

    try {
      const existingRawTools = await getDynamicToolsRawByScope(chatId)
      const existingTools = parseDynamicToolList(existingRawTools)

      const mergedTools = uniqueByName([
        ...existingTools.filter((tool) => tool.name !== definition.name),
        definition,
      ])

      const saved = await saveDynamicToolsRaw(mergedTools, chatId)
      if (!saved) {
        return 'Error creating dynamic tool: failed to save in Redis'
      }

      logger.info(
        {
          chatId,
          toolName: definition.name,
          action: definition.action,
        },
        'Dynamic tool saved',
      )

      return `Dynamic tool "${definition.name}" saved to chat scope`
    } catch (error) {
      const errorMsg = getErrorMessage(error)
      logger.error(
        {
          chatId,
          toolName: definition.name,
          error,
        },
        'Dynamic tool save failed',
      )
      return `Error creating dynamic tool: ${errorMsg}`
    }
  },
})
