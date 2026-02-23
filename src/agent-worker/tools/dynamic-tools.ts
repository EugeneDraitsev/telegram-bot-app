import { z } from 'zod'

import {
  formatWeatherText,
  getDynamicToolsRaw,
  getWeather,
} from '@tg-bot/common'
import { searchWeb } from '../services'
import { type AgentTool, Type } from '../types'
import { addResponse, requireToolContext } from './context'

const MAX_DYNAMIC_TOOLS = 16

export const DYNAMIC_ACTIONS = z.enum([
  'send_text',
  'web_search',
  'get_weather',
])

export const dynamicToolDefinitionSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{2,63}$/),
  description: z.string().trim().min(8).max(500),
  action: DYNAMIC_ACTIONS,
  template: z.string().trim().max(2000).optional(),
  searchFormat: z.enum(['brief', 'detailed', 'list']).optional(),
  enabled: z.boolean().optional(),
})

export type DynamicToolDefinition = z.infer<typeof dynamicToolDefinitionSchema>

function buildPrompt(template: string | undefined, input: string): string {
  const normalizedInput = input.trim()
  const normalizedTemplate = template?.trim()

  if (!normalizedTemplate) {
    return normalizedInput
  }

  if (normalizedTemplate.includes('{{input}}')) {
    return normalizedTemplate.replaceAll('{{input}}', normalizedInput).trim()
  }

  if (!normalizedInput) {
    return normalizedTemplate
  }

  return `${normalizedTemplate}\n${normalizedInput}`.trim()
}

function createDynamicTool(definition: DynamicToolDefinition): AgentTool {
  const { name, description, action, template, searchFormat } = definition

  if (action === 'send_text') {
    return {
      declaration: {
        name,
        description,
        parameters: {
          type: Type.OBJECT,
          properties: {
            input: {
              type: Type.STRING,
              description: 'Text to send to user',
            },
          },
          required: ['input'],
        },
      },
      execute: async (args) => {
        requireToolContext()
        const text = buildPrompt(template, args.input as string)
        if (!text) {
          return `Error: Dynamic tool "${name}" produced empty text`
        }

        addResponse({ type: 'text', text })
        return `Dynamic tool "${name}" added text response`
      },
    }
  }

  if (action === 'web_search') {
    return {
      declaration: {
        name,
        description,
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: 'What to search on the web',
            },
            format: {
              type: Type.STRING,
              description: 'Response format',
              enum: ['brief', 'detailed', 'list'],
            },
          },
          required: ['query'],
        },
      },
      execute: async (args) => {
        requireToolContext()
        const preparedQuery = buildPrompt(template, args.query as string)
        if (!preparedQuery) {
          return `Error: Dynamic tool "${name}" has empty query`
        }

        const text = await searchWeb(
          preparedQuery,
          (args.format as 'brief' | 'detailed' | 'list') ?? searchFormat,
        )
        addResponse({ type: 'text', text })
        return `Dynamic tool "${name}" completed web search`
      },
    }
  }

  // get_weather action
  return {
    declaration: {
      name,
      description,
      parameters: {
        type: Type.OBJECT,
        properties: {
          location: {
            type: Type.STRING,
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
      addResponse({
        type: 'text',
        text: formatWeatherText(weather),
      })
      return `Dynamic tool "${name}" got weather for ${weather.city}`
    },
  }
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

    const parsed = dynamicToolDefinitionSchema.safeParse(rawTool)
    if (!parsed.success) {
      continue
    }

    const definition = parsed.data
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
