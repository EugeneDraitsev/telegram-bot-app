/**
 * Tools for reading and updating agent memory (chat-scoped and global).
 *
 * Memory is stored as markdown in Redis. The agent decides autonomously
 * when to read or update it — ideally not on every message.
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import {
  getChatMemory,
  getErrorMessage,
  getGlobalMemory,
  setChatMemory,
  setGlobalMemory,
} from '@tg-bot/common'
import { requireToolContext } from './context'

export const getMemoryTool = new DynamicStructuredTool({
  name: 'get_memory',
  description:
    'Retrieve your saved memory notes. Use "chat" scope for notes specific to the current chat (user preferences, inside jokes, etc.) or "global" for cross-chat knowledge. Memory is preloaded in context at the start, so call this only if you need to re-read the latest version after an update.',
  schema: z.object({
    scope: z
      .enum(['chat', 'global'])
      .describe(
        'Which memory to read: "chat" (current chat) or "global" (cross-chat).',
      ),
  }),
  func: async ({ scope }) => {
    const { message } = requireToolContext()

    try {
      if (scope === 'chat') {
        const chatId = message.chat?.id
        if (!chatId) return 'Error: No chat ID available'
        const memory = await getChatMemory(chatId)
        return memory || '(empty — no chat memory saved yet)'
      }

      const memory = await getGlobalMemory()
      return memory || '(empty — no global memory saved yet)'
    } catch (error) {
      return `Error reading memory: ${getErrorMessage(error)}`
    }
  },
})

export const updateMemoryTool = new DynamicStructuredTool({
  name: 'update_memory',
  description:
    'Save or update your memory notes (markdown). Use sparingly — only when you learn something genuinely worth remembering (e.g. user preferences, important facts, self-improvement notes). "chat" scope is for current-chat notes, "global" is for cross-chat knowledge. Content replaces the previous value entirely, so include everything you want to keep.',
  schema: z.object({
    scope: z
      .enum(['chat', 'global'])
      .describe(
        'Which memory to update: "chat" (current chat) or "global" (cross-chat).',
      ),
    content: z
      .string()
      .describe(
        'Full markdown content to save. This replaces the existing memory entirely.',
      ),
  }),
  func: async ({ scope, content }) => {
    const { message } = requireToolContext()

    try {
      if (scope === 'chat') {
        const chatId = message.chat?.id
        if (!chatId) return 'Error: No chat ID available'
        const ok = await setChatMemory(chatId, content)
        return ok
          ? 'Chat memory updated successfully.'
          : 'Error: failed to save chat memory.'
      }

      const ok = await setGlobalMemory(content)
      return ok
        ? 'Global memory updated successfully.'
        : 'Error: failed to save global memory.'
    } catch (error) {
      return `Error updating memory: ${getErrorMessage(error)}`
    }
  },
})
