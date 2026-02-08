/**
 * Agent tools.
 *
 * All tools are pure: they collect data and responses, but do not send
 * Telegram messages directly.
 */

import type { DynamicStructuredTool } from '@langchain/core/tools'

import { createDynamicToolTool } from './create-dynamic-tool.tool'
import { doNothingTool } from './do-nothing.tool'
import { loadDynamicTools } from './dynamic-tools'
import { generateImageTool } from './generate-image.tool'
import { generateVoiceTool } from './generate-voice.tool'
import { getHistoryTool } from './get-history.tool'
import { searchGifTool } from './search-gif.tool'
import { searchImageTool } from './search-image.tool'
import { searchVideoTool } from './search-video.tool'
import { sendTextTool } from './send-text.tool'
import { summarizeContentTool } from './summarize-content.tool'
import { weatherTool } from './weather.tool'
import { webSearchTool } from './web-search.tool'

// Context management
export {
  addResponse,
  clearToolContext,
  getCollectedResponses,
  getToolContext,
  requireToolContext,
  runWithToolContext,
  setToolContext,
  type ToolContext,
} from './context'
// Individual tools
export { createDynamicToolTool } from './create-dynamic-tool.tool'
export { doNothingTool } from './do-nothing.tool'
export { loadDynamicTools } from './dynamic-tools'
export { generateImageTool } from './generate-image.tool'
export { generateVoiceTool } from './generate-voice.tool'
export { getHistoryTool } from './get-history.tool'
export { searchGifTool } from './search-gif.tool'
export { searchImageTool } from './search-image.tool'
export { searchVideoTool } from './search-video.tool'
export { sendTextTool } from './send-text.tool'
export { summarizeContentTool } from './summarize-content.tool'
export { weatherTool } from './weather.tool'
export { webSearchTool } from './web-search.tool'

export const TOOL_NAMES = {
  SEND_TEXT: 'send_text',
  SEARCH_IMAGE: 'search_image',
  GENERATE_IMAGE: 'generate_or_edit_image',
  SEARCH_VIDEO: 'search_video',
  SEARCH_GIF: 'search_gif',
  GENERATE_VOICE: 'generate_voice',
  GET_WEATHER: 'get_weather',
  WEB_SEARCH: 'web_search',
  SUMMARIZE_CONTENT: 'summarize_content',
  GET_HISTORY: 'get_chat_history',
  CREATE_DYNAMIC_TOOL: 'create_dynamic_tool',
  DO_NOTHING: 'do_nothing',
} as const

const ENABLE_DYNAMIC_TOOL_CREATION_TOOL = true

const baseAgentTools: DynamicStructuredTool[] = [
  sendTextTool,
  searchImageTool,
  generateImageTool,
  searchVideoTool,
  searchGifTool,
  generateVoiceTool,
  weatherTool,
  webSearchTool,
  summarizeContentTool,
  getHistoryTool,
  ...(ENABLE_DYNAMIC_TOOL_CREATION_TOOL ? [createDynamicToolTool] : []),
  doNothingTool,
]

const baseToolNames = new Set(baseAgentTools.map((tool) => tool.name))

export function getBaseAgentTools(): DynamicStructuredTool[] {
  return [...baseAgentTools]
}

/**
 * Resolve all tools for a specific chat:
 * - static built-in tools
 * - optional dynamic tools from Redis
 */
export async function getAgentTools(
  chatId?: number,
): Promise<DynamicStructuredTool[]> {
  const tools = getBaseAgentTools()
  const dynamicTools = await loadDynamicTools(chatId, baseToolNames)
  return dynamicTools.length ? [...tools, ...dynamicTools] : tools
}
