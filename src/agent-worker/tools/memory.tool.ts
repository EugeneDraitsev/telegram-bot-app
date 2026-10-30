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
import { requireToolContext, setToolChatMemory } from './context'

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
        if (!chatId) throw new Error('No chat ID available')
        const memory = await getChatMemory(chatId, { fresh: true })
        setToolChatMemory(memory)
        return memory || '(empty — no chat memory saved yet)'
      }

      const memory = await getGlobalMemory()
      return memory || '(empty — no global memory saved yet)'
    } catch (error) {
      throw new Error(`Error reading memory: ${getErrorMessage(error)}`)
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
    const { message, chatMemory: seenMemory } = requireToolContext()

    try {
      const chatId = message.chat?.id
      if (!chatId) throw new Error('No chat ID available')
      // The content replaces everything, so it must build on the current
      // memory: the preload may come from a stale cache or have failed.
      if (seenMemory !== undefined) {
        const currentMemory = await getChatMemory(chatId, { fresh: true })
        if (currentMemory !== seenMemory) {
          setToolChatMemory(currentMemory)
          throw new Error(
            `chat memory changed since you read it, so nothing was saved. Current memory:\n${currentMemory || '(empty)'}\nMerge your update into it and call update_memory again.`,
          )
        }
      }
      const content = String(args.content ?? '')
      const ok = await setChatMemory(chatId, content)
      if (!ok) throw new Error('Failed to save chat memory')
      setToolChatMemory(content.trim())
      return 'Chat memory updated successfully.'
    } catch (error) {
      throw new Error(`Error updating memory: ${getErrorMessage(error)}`)
    }
  },
}
