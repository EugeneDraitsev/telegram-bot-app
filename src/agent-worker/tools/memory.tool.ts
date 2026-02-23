/**
 * Tools for reading and updating agent memory (chat-scoped and global).
 */

import {
  getChatMemory,
  getErrorMessage,
  getGlobalMemory,
  setChatMemory,
  setGlobalMemory,
} from '@tg-bot/common'
import { type AgentTool, Type } from '../types'
import { requireToolContext } from './context'

export const getMemoryTool: AgentTool = {
  declaration: {
    name: 'get_memory',
    description:
      'Retrieve your saved memory notes. Use "chat" scope for current chat notes or "global" for cross-chat knowledge. Memory is preloaded in context, so call this only if you need re-read after an update.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        scope: {
          type: Type.STRING,
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
    name: 'update_memory',
    description:
      'Save or update your memory notes (markdown). Use sparingly — only when you learn something genuinely worth remembering. Content replaces the previous value entirely.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        scope: {
          type: Type.STRING,
          description: 'Which memory to update: "chat" or "global".',
          enum: ['chat', 'global'],
        },
        content: {
          type: Type.STRING,
          description:
            'Full markdown content to save. Replaces the existing memory entirely.',
        },
      },
      required: ['scope', 'content'],
    },
  },
  execute: async (args) => {
    const { message } = requireToolContext()

    try {
      if (args.scope === 'chat') {
        const chatId = message.chat?.id
        if (!chatId) return 'Error: No chat ID available'
        const ok = await setChatMemory(chatId, args.content as string)
        return ok
          ? 'Chat memory updated successfully.'
          : 'Error: failed to save chat memory.'
      }

      const ok = await setGlobalMemory(args.content as string)
      return ok
        ? 'Global memory updated successfully.'
        : 'Error: failed to save global memory.'
    } catch (error) {
      return `Error updating memory: ${getErrorMessage(error)}`
    }
  },
}
