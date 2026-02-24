/**
 * Tool for creating/updating dynamic tools in Redis.
 */

import {
  getDynamicToolsRawByScope,
  getErrorMessage,
  saveDynamicToolsRaw,
} from '@tg-bot/common'
import { logger } from '../logger'
import type { AgentTool } from '../types'
import { requireToolContext } from './context'
import {
  type DynamicToolDefinition,
  dynamicToolDefinitionSchema,
} from './dynamic-tools'

const RESERVED_TOOL_NAMES = new Set<string>([
  'get_datetime',
  'code_execution',
  'random_number',
  'random_choice',
  'magic_8_ball',
  'telegram_dice',
  'search_image',
  'generate_or_edit_image',
  'search_video',
  'search_gif',
  'animate_text',
  'generate_voice',
  'get_weather',
  'get_chat_history',
  'get_memory',
  'update_memory',
  'create_dynamic_tool',
  'web_search',
  'url_context',
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

export const createDynamicToolTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'create_dynamic_tool',
    description:
      'Create or update dynamic tool in Redis for current chat. Use only when the current user message explicitly asks for reusable automation.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Tool name (lowercase, underscores, 3-64 chars, e.g. "check_btc")',
        },
        description: {
          type: 'string',
          description: 'What the tool does (8-500 chars)',
        },
        action: {
          type: 'string',
          description: 'Action type',
          enum: ['send_text', 'web_search', 'get_weather'],
        },
        template: {
          type: 'string',
          description:
            'Optional template with {{input}} placeholder (max 2000 chars)',
        },
        searchFormat: {
          type: 'string',
          description: 'Search format for web_search action',
          enum: ['brief', 'detailed', 'list'],
        },
        enabled: {
          type: 'boolean',
          description: 'Whether the tool is enabled. Default: true',
        },
      },
      required: ['name', 'description', 'action'],
    },
  },
  execute: async (args) => {
    const { message } = requireToolContext()
    const chatId = message.chat?.id
    if (!chatId) {
      return 'Error creating dynamic tool: Chat ID is missing'
    }

    const parsed = dynamicToolDefinitionSchema.safeParse(args)
    if (!parsed.success) {
      return `Error creating dynamic tool: ${parsed.error.message}`
    }

    const definition: DynamicToolDefinition = {
      ...parsed.data,
      enabled: parsed.data.enabled ?? true,
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
}
