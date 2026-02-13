/**
 * Agent tools.
 *
 * All tools are pure: they collect data and responses, but do not send
 * Telegram messages directly.
 */

import type { DynamicStructuredTool } from '@langchain/core/tools'

import { animateGifTool } from './animate-gif.tool'
import { calculatorTool } from './calculator.tool'
import { createDynamicToolTool } from './create-dynamic-tool.tool'
import { dateTimeTool } from './datetime.tool'
import { telegramDiceTool } from './dice.tool'
import { doNothingTool } from './do-nothing.tool'
import { loadDynamicTools } from './dynamic-tools'
import { generateImageTool } from './generate-image.tool'
import { generateVoiceTool } from './generate-voice.tool'
import { getHistoryTool } from './get-history.tool'
import { magic8BallTool } from './magic8ball.tool'
import { getMemoryTool, updateMemoryTool } from './memory.tool'
import { randomChoiceTool, randomNumberTool } from './random.tool'
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
  getCollectedResponses,
  requireToolContext,
  runWithToolContext,
} from './context'

// Individual tools
export {
  animateGifTool,
  calculatorTool,
  createDynamicToolTool,
  dateTimeTool,
  doNothingTool,
  generateImageTool,
  generateVoiceTool,
  getHistoryTool,
  getMemoryTool,
  loadDynamicTools,
  magic8BallTool,
  randomChoiceTool,
  randomNumberTool,
  searchGifTool,
  searchImageTool,
  searchVideoTool,
  sendTextTool,
  summarizeContentTool,
  telegramDiceTool,
  updateMemoryTool,
  weatherTool,
  webSearchTool,
}

export const TOOL_NAMES = {
  SEND_TEXT: 'send_text',
  GET_DATETIME: 'get_datetime',
  CALCULATOR: 'calculator',
  RANDOM_NUMBER: 'random_number',
  RANDOM_CHOICE: 'random_choice',
  MAGIC_8_BALL: 'magic_8_ball',
  TELEGRAM_DICE: 'telegram_dice',
  SEARCH_IMAGE: 'search_image',
  GENERATE_IMAGE: 'generate_or_edit_image',
  SEARCH_VIDEO: 'search_video',
  SEARCH_GIF: 'search_gif',
  ANIMATE_TEXT: 'animate_text',
  GENERATE_VOICE: 'generate_voice',
  GET_WEATHER: 'get_weather',
  WEB_SEARCH: 'web_search',
  SUMMARIZE_CONTENT: 'summarize_content',
  GET_HISTORY: 'get_chat_history',
  GET_MEMORY: 'get_memory',
  UPDATE_MEMORY: 'update_memory',
  CREATE_DYNAMIC_TOOL: 'create_dynamic_tool',
  DO_NOTHING: 'do_nothing',
} as const

const baseAgentTools: DynamicStructuredTool[] = [
  sendTextTool,
  dateTimeTool,
  calculatorTool,
  randomNumberTool,
  randomChoiceTool,
  magic8BallTool,
  telegramDiceTool,
  searchImageTool,
  generateImageTool,
  searchVideoTool,
  searchGifTool,
  animateGifTool,
  generateVoiceTool,
  weatherTool,
  webSearchTool,
  summarizeContentTool,
  getHistoryTool,
  getMemoryTool,
  updateMemoryTool,
  createDynamicToolTool,
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
