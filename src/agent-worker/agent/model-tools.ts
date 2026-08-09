import {
  tool as defineAiTool,
  type JSONSchema7,
  jsonSchema,
  type ToolSet,
} from 'ai'

import type { AgentTool } from '../types'

export function buildNativeTools(agentTools: AgentTool[]): ToolSet {
  return Object.fromEntries(
    agentTools
      .filter((tool) => tool.exposeToModel !== false)
      .map((tool) => [
        tool.declaration.name,
        defineAiTool({
          description: tool.declaration.description,
          inputSchema: jsonSchema(
            (tool.declaration.parameters ?? {
              type: 'object',
              properties: {},
              additionalProperties: false,
            }) as JSONSchema7,
          ),
        }),
      ]),
  )
}
