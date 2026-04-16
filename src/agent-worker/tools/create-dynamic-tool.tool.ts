/**
 * Tool for creating/updating dynamic tools in Redis.
 */

import {
  getDynamicToolsRawByScope,
  getErrorMessage,
  logger,
  saveDynamicToolsRaw,
} from '@tg-bot/common'
import type { AgentTool } from '../types'
import { requireToolContext } from './context'
import {
  type DynamicToolDefinition,
  dynamicToolDefinitionSchema,
  normalizeDynamicToolInput,
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

function getRawToolName(rawTool: unknown): string | undefined {
  if (!rawTool || typeof rawTool !== 'object') {
    return undefined
  }

  const normalized = normalizeDynamicToolInput(rawTool as Record<string, unknown>)
  return typeof normalized.name === 'string' ? normalized.name : undefined
}

function parseDynamicToolList(rawTools: unknown[]): DynamicToolDefinition[] {
  const parsedTools: DynamicToolDefinition[] = []
  for (const rawTool of rawTools) {
    if (!rawTool || typeof rawTool !== 'object') {
      continue
    }

    const parsed = dynamicToolDefinitionSchema.safeParse(
      normalizeDynamicToolInput(rawTool as Record<string, unknown>),
    )
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
      'Create or update a dynamic command in Redis for the current chat. Persist the final command object, not a partial patch. template is required. For web_search commands, template is the exact query text sent into web_search and may include {{input}}. stickerFileId must be the exact full Telegram sticker.file_id value.',
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
            'Required final template. For send_text this is the outgoing message. For web_search this is the exact search query text sent into web_search. Use {{input}} only when extra command arguments should be inserted. Max 2000 chars.',
        },
        searchFormat: {
          type: 'string',
          description:
            'Output format for web_search results. Does not change the query text.',
          enum: ['brief', 'detailed', 'list'],
        },
        stickerFileId: {
          type: 'string',
          description:
            'Optional Telegram sticker file_id to send together with the command response',
        },
        enabled: {
          type: 'boolean',
          description: 'Whether the tool is enabled. Default: true',
        },
      },
      required: ['name', 'description', 'action', 'template'],
    },
  },
  execute: async (args) => {
    const { message } = requireToolContext()
    const chatId = message.chat?.id
    if (!chatId) {
      return 'Error creating dynamic tool: Chat ID is missing'
    }

    try {
      const normalizedArgs = normalizeDynamicToolInput(args)
      const existingRawTools = await getDynamicToolsRawByScope(chatId)
      const existingTools = parseDynamicToolList(existingRawTools)
      const existingTool =
        typeof normalizedArgs.name === 'string'
          ? existingTools.find((tool) => tool.name === normalizedArgs.name)
          : undefined

      const parsed = dynamicToolDefinitionSchema.safeParse({
        ...existingTool,
        ...normalizedArgs,
      })
      if (!parsed.success) {
        return `Error creating dynamic tool: ${parsed.error.message}`
      }

      const definition: DynamicToolDefinition = {
        ...parsed.data,
        enabled: parsed.data.enabled ?? existingTool?.enabled ?? true,
      }

      if (RESERVED_TOOL_NAMES.has(definition.name)) {
        return `Error creating dynamic tool: "${definition.name}" conflicts with built-in tool name`
      }

      const mergedTools = [
        ...existingRawTools.filter(
          (rawTool) => getRawToolName(rawTool) !== definition.name,
        ),
        definition,
      ]

      const saved = await saveDynamicToolsRaw(mergedTools, chatId)
      if (!saved) {
        return 'Error creating dynamic tool: failed to save in Redis'
      }

      logger.info(
        {
          chatId,
          toolName: definition.name,
          action: definition.action,
          hasSticker: Boolean(definition.stickerFileId),
        },
        'Dynamic tool saved',
      )

      return `Dynamic tool "/${definition.name}" saved to chat scope`
    } catch (error) {
      const errorMsg = getErrorMessage(error)
      logger.error(
        {
          chatId,
          toolName:
            typeof args.name === 'string'
              ? normalizeDynamicToolInput(args).name
              : undefined,
          error,
        },
        'Dynamic tool save failed',
      )
      return `Error creating dynamic tool: ${errorMsg}`
    }
  },
}
