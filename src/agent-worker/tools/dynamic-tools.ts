import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import { getDynamicToolsRaw } from '@tg-bot/common'
import { formatWeatherText, getWeather, searchWeb } from '../services'
import { addResponse, requireToolContext } from './context'

const MAX_DYNAMIC_TOOLS = 16

const DYNAMIC_ACTIONS = z.enum(['send_text', 'web_search', 'get_weather'])

const dynamicToolDefinitionSchema = z.object({
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

type DynamicToolDefinition = z.infer<typeof dynamicToolDefinitionSchema>

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

function createDynamicTool(
  definition: DynamicToolDefinition,
): DynamicStructuredTool {
  const { name, description, action, template, searchFormat } = definition

  if (action === 'send_text') {
    return new DynamicStructuredTool({
      name,
      description,
      schema: z.object({
        input: z.string().describe('Text to send to user'),
      }),
      func: async ({ input }) => {
        requireToolContext()
        const text = buildPrompt(template, input)
        if (!text) {
          return `Error: Dynamic tool "${name}" produced empty text`
        }

        addResponse({ type: 'text', text })
        return `Dynamic tool "${name}" added text response`
      },
    })
  }

  if (action === 'web_search') {
    return new DynamicStructuredTool({
      name,
      description,
      schema: z.object({
        query: z.string().describe('What to search on the web'),
        format: z.enum(['brief', 'detailed', 'list']).optional(),
      }),
      func: async ({ query, format }) => {
        requireToolContext()
        const preparedQuery = buildPrompt(template, query)
        if (!preparedQuery) {
          return `Error: Dynamic tool "${name}" has empty query`
        }

        const text = await searchWeb(preparedQuery, format ?? searchFormat)
        addResponse({ type: 'text', text })
        return `Dynamic tool "${name}" completed web search`
      },
    })
  }

  return new DynamicStructuredTool({
    name,
    description,
    schema: z.object({
      location: z.string().describe('City or location for weather'),
    }),
    func: async ({ location }) => {
      requireToolContext()
      const preparedLocation = buildPrompt(template, location)
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
  })
}

export async function loadDynamicTools(
  chatId: number | undefined,
  reservedNames: Set<string>,
): Promise<DynamicStructuredTool[]> {
  if (process.env.ENABLE_DYNAMIC_TOOLS === 'false' || !chatId) {
    return []
  }

  const rawTools = await getDynamicToolsRaw(chatId)
  if (!rawTools.length) {
    return []
  }

  const resolvedTools: DynamicStructuredTool[] = []
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
