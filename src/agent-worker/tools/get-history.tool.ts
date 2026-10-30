/**
 * Tool for getting chat history
 */

import type { Message } from 'grammy/types'

import {
  DEFAULT_AGENT_HISTORY_LIMIT,
  formatHistoryForDisplay,
  getErrorMessage,
  getRawHistory,
  getRecentRawHistory,
  MAX_HISTORY_TOOL_LIMIT,
} from '@tg-bot/common'
import type { AgentTool } from '../types'
import { requireToolContext } from './context'

// A tool result is re-sent in every later model round, and a busy chat keeps
// thousands of messages a day.
const MAX_HISTORY_RESULT_CHARS = 60_000

/** Renders the newest messages that fit, noting how many older ones were cut. */
function renderNewestWithin(
  messages: Message[],
  render: (kept: Message[]) => string,
): string {
  let kept = messages
  let result = render(kept)
  while (result.length > MAX_HISTORY_RESULT_CHARS && kept.length > 1) {
    kept = kept.slice(Math.ceil(kept.length / 4))
    result = render(kept)
  }

  const omitted = messages.length - kept.length
  return omitted
    ? `${omitted} older messages omitted to fit the context.\n${result}`
    : result
}

export const getHistoryTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'get_chat_history',
    description:
      'Get chat messages for context. Recent 40 messages are already available by default, but you can request more or all available history when needed.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description:
            'Number of recent messages to retrieve. Default: 40, Max: 200. Use all=true for the full available history.',
        },
        all: {
          type: 'boolean',
          description: 'Set to true to retrieve all retained history.',
        },
        raw: {
          type: 'boolean',
          description:
            'Set to true to return raw message JSON instead of human-readable previews. Use this for full text or captions and exact media metadata like sticker.file_id.',
        },
      },
    },
  },
  execute: async (args) => {
    const { message } = requireToolContext()
    const chatId = message.chat?.id

    if (!chatId) {
      throw new Error('No chat ID available')
    }

    try {
      const limit = args.limit as number | undefined
      const wantsAll = args.all === true
      const wantsRaw = args.raw === true
      const normalizedLimit = Number.isFinite(limit)
        ? Math.min(
            Math.max(Math.trunc(limit ?? DEFAULT_AGENT_HISTORY_LIMIT), 1),
            MAX_HISTORY_TOOL_LIMIT,
          )
        : DEFAULT_AGENT_HISTORY_LIMIT

      const history = wantsAll
        ? await getRawHistory(chatId)
        : await getRecentRawHistory(chatId, normalizedLimit)
      if (wantsRaw) {
        return renderNewestWithin(history, (kept) => JSON.stringify(kept))
      }
      return renderNewestWithin(history, (kept) =>
        wantsAll
          ? formatHistoryForDisplay(kept, {
              limit: kept.length || DEFAULT_AGENT_HISTORY_LIMIT,
              headerLabel: 'Available history',
            })
          : formatHistoryForDisplay(kept, normalizedLimit),
      )
    } catch (error) {
      throw new Error(`Error getting history: ${getErrorMessage(error)}`)
    }
  },
}
