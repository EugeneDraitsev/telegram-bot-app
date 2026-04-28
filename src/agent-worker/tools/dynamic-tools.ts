import { z } from 'zod'
import type { Message } from 'telegram-typings'

import {
  findCommand,
  formatWeatherText,
  getDynamicToolsRaw,
  getParsedText,
  getWeather,
} from '@tg-bot/common'
import { searchWeb } from '../services/gemini'
import type { AgentTool } from '../types'
import { addResponse, requireToolContext } from './context'

const MAX_DYNAMIC_TOOLS = 16

export interface DynamicToolDependencies {
  searchWeb: typeof searchWeb
}

const defaultDynamicToolDependencies: DynamicToolDependencies = {
  searchWeb,
}

export const dynamicToolDefinitionSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{2,63}$/),
  description: z.string().trim().min(8).max(500),
  action: z.enum(['send_text', 'web_search', 'get_weather']),
  template: z.string().trim().min(1).max(2000),
  searchFormat: z.enum(['brief', 'detailed', 'list']).optional(),
  stickerFileId: z.string().trim().min(1).max(512).optional(),
  enabled: z.boolean().optional(),
})

export type DynamicToolDefinition = z.infer<typeof dynamicToolDefinitionSchema>
export interface DynamicCommandExecutionResult {
  matched: boolean
  name?: string
  result?: string
}

function normalizeDynamicToolName(value: string): string {
  return value.trim().replace(/^\/+/, '').replace(/@.*/, '').toLowerCase()
}

export function normalizeDynamicToolInput(
  rawTool: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...rawTool }

  if (typeof normalized.name === 'string') {
    normalized.name = normalizeDynamicToolName(normalized.name)
  }

  if (typeof normalized.stickerFileId === 'string') {
    normalized.stickerFileId = normalized.stickerFileId.trim()
  }

  return normalized
}

function parseDynamicTool(rawTool: unknown): DynamicToolDefinition | undefined {
  if (!rawTool || typeof rawTool !== 'object') {
    return undefined
  }

  const parsed = dynamicToolDefinitionSchema.safeParse(
    normalizeDynamicToolInput(rawTool as Record<string, unknown>),
  )
  if (!parsed.success) {
    return undefined
  }

  return parsed.data
}

function buildPrompt(
  template: string,
  input: string,
  options: { stripOutputPlaceholder?: boolean } = {},
): string {
  const normalizedInput = input.trim()
  const normalizedTemplate = (
    options.stripOutputPlaceholder
      ? template.replaceAll('{{output}}', '')
      : template
  ).trim()

  if (normalizedTemplate.includes('{{input}}')) {
    return normalizedTemplate.replaceAll('{{input}}', normalizedInput).trim()
  }

  if (!normalizedInput) {
    return normalizedTemplate
  }

  return `${normalizedTemplate}\n${normalizedInput}`.trim()
}

function createDynamicTool(
  definition: DynamicToolDefinition,
  dependencies: DynamicToolDependencies = defaultDynamicToolDependencies,
): AgentTool {
  const { name, description, action, template, stickerFileId } = definition

  function addStickerResponseIfPresent() {
    if (stickerFileId) {
      addResponse({ type: 'sticker', fileId: stickerFileId })
    }
  }

  if (action === 'send_text') {
    return {
      declaration: {
        type: 'function',
        name,
        description,
        parameters: {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: 'Text to send to user',
            },
          },
          required: ['input'],
        },
      },
      execute: async (args) => {
        requireToolContext()
        const text = buildPrompt(template, args.input as string)
        if (!text && !stickerFileId) {
          return `Error: Dynamic tool "${name}" produced empty text`
        }

        if (text) {
          addResponse({ type: 'text', text })
        }
        addStickerResponseIfPresent()
        return `Dynamic tool "${name}" added response`
      },
    }
  }

  if (action === 'web_search') {
    return {
      declaration: {
        type: 'function',
        name,
        description,
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'What to search on the web',
            },
            format: {
              type: 'string',
              description: 'Response format',
              enum: ['brief', 'detailed', 'list'],
            },
          },
          required: ['query'],
        },
      },
      execute: async (args) => {
        requireToolContext()
        const preparedQuery = buildPrompt(template, args.query as string, {
          stripOutputPlaceholder: true,
        })
        if (!preparedQuery) {
          return `Error: Dynamic tool "${name}" has empty query`
        }

        const text = await dependencies.searchWeb(
          preparedQuery,
          (args.format as 'brief' | 'detailed' | 'list') ??
            definition.searchFormat,
        )
        addStickerResponseIfPresent()
        return text
      },
    }
  }

  // get_weather action
  return {
    declaration: {
      type: 'function',
      name,
      description,
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'City or location for weather',
          },
        },
        required: ['location'],
      },
    },
    execute: async (args) => {
      requireToolContext()
      const preparedLocation = buildPrompt(template, args.location as string)
      if (!preparedLocation) {
        return `Error: Dynamic tool "${name}" has empty location`
      }

      const weather = await getWeather(preparedLocation)
      const text = formatWeatherText(weather)
      addStickerResponseIfPresent()
      return text
    },
  }
}

export async function executeDynamicCommandFromMessage(
  message: Message,
  reservedNames: Set<string> = new Set(),
  dependencies: DynamicToolDependencies = defaultDynamicToolDependencies,
): Promise<DynamicCommandExecutionResult> {
  const chatId = message.chat?.id
  if (!chatId) {
    return { matched: false }
  }

  const sourceText =
    typeof message.text === 'string'
      ? message.text
      : typeof message.caption === 'string'
        ? message.caption
        : ''

  if (!sourceText.trimStart().startsWith('/')) {
    return { matched: false }
  }

  const rawCommand = findCommand(sourceText)
  if (!rawCommand.startsWith('/')) {
    return { matched: false }
  }

  const normalizedName = normalizeDynamicToolName(rawCommand)
  const definition = (await getDynamicToolsRaw(chatId))
    .map(parseDynamicTool)
    .find(
      (tool) =>
        tool &&
        tool.enabled !== false &&
        !reservedNames.has(tool.name) &&
        tool.name === normalizedName,
    )

  if (!definition) {
    return { matched: false }
  }

  const tool = createDynamicTool(definition, dependencies)
  const input = getParsedText(sourceText).trim()
  const args =
    definition.action === 'send_text'
      ? { input }
      : definition.action === 'web_search'
        ? { query: input, format: definition.searchFormat }
        : { location: input }

  const result = await tool.execute(args)
  return { matched: true, name: definition.name, result }
}

export async function loadDynamicTools(
  chatId: number | undefined,
  reservedNames: Set<string>,
): Promise<AgentTool[]> {
  if (!chatId) {
    return []
  }

  const rawTools = await getDynamicToolsRaw(chatId)
  if (!rawTools.length) {
    return []
  }

  const resolvedTools: AgentTool[] = []
  const usedNames = new Set(reservedNames)

  for (const rawTool of rawTools) {
    if (resolvedTools.length >= MAX_DYNAMIC_TOOLS) {
      break
    }

    const definition = parseDynamicTool(rawTool)
    if (!definition) {
      continue
    }

    if (definition.enabled === false) {
      continue
    }

    if (usedNames.has(definition.name)) {
      continue
    }

    usedNames.add(definition.name)
    resolvedTools.push(createDynamicTool(definition))
  }

  return resolvedTools
}
