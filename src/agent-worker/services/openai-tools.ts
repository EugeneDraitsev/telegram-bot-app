import type { Tool } from 'openai/resources/responses/responses'

export const OPENAI_WEB_SEARCH_TOOLS: Tool[] = [
  { type: 'web_search', search_context_size: 'high' },
]
