/**
 * Tools for reading and updating agent memory (chat-scoped and global).
 */

import {
  getChatMemory,
  getErrorMessage,
  getGlobalMemory,
  setChatMemory,
} from '@tg-bot/common'
import type { AgentTool } from '../types'
import { requireToolContext } from './context'

export const getMemoryTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'get_memory',
    description:
      'Retrieve your saved memory notes. Use "chat" scope for current chat notes or "global" for cross-chat knowledge. Memory is preloaded in context, so call this only if you need re-read after an update.',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: 'Which memory to read: "chat" or "global".',
          enum: ['chat', 'global'],
        },
      },
      required: ['scope'],
    },
  },
  execute: async (args) => {
    const { message } = requireToolContext()

    try {
      if (args.scope === 'chat') {
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
}

export const updateMemoryTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'update_memory',
    description:
      'Save or update chat-scoped memory notes (markdown). Use sparingly — only when you learn something genuinely worth remembering. Content replaces the previous chat memory entirely. Global memory is read-only.',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description:
            'Full markdown content to save. Replaces the existing memory entirely.',
        },
      },
      required: ['content'],
    },
  },
  execute: async (args) => {
    const { message } = requireToolContext()

    try {
      const chatId = message.chat?.id
      if (!chatId) return 'Error: No chat ID available'
      const ok = await setChatMemory(chatId, args.content as string)
      return ok
        ? 'Chat memory updated successfully.'
        : 'Error: failed to save chat memory.'
    } catch (error) {
      return `Error updating memory: ${getErrorMessage(error)}`
    }
  },
}
