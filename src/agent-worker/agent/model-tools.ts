import {
  tool as defineAiTool,
  type JSONSchema7,
  jsonSchema,
  type ToolSet,
} from 'ai'

import type { AgentTool } from '../types'

export function buildModelToolRegistry(agentTools: AgentTool[]): {
  tools: ToolSet
  toolByName: Map<string, AgentTool>
} {
  const entries = agentTools
    .filter((tool) => tool.exposeToModel !== false)
    .map((tool) => [tool.declaration.name, tool] as const)

  return {
    tools: Object.fromEntries(
      entries.map(([name, tool]) => [
        name,
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
    ),
    toolByName: new Map(entries),
  }
}
