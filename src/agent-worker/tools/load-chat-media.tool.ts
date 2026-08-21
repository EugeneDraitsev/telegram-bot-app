import {
  getErrorMessage,
  getMessageMediaRefs,
  getRawHistory,
  resolveMediaBuffers,
} from '@tg-bot/common'
import type { AgentTool } from '../types'
import {
  queueModelInspectionImages,
  registerToolMediaBuffers,
  requireToolContext,
} from './context'

function getMessageId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('messageId must be a positive Telegram message_id')
  }
  return value
}

export const loadChatMediaTool: AgentTool = {
  execution: ['serial'],
  declaration: {
    type: 'function',
    name: 'load_chat_media',
    description:
      'Load images from one exact Telegram message in the available 24-hour chat history and register stable media_id values for later media tools. Loaded images are attached to the next model round for visual inspection. Use when the current request refers to a historical image. Choose messageId semantically from structured history; never guess it.',
    parameters: {
      type: 'object',
      properties: {
        messageId: {
          type: 'integer',
          minimum: 1,
          description:
            'Exact Telegram message_id shown in recent history or returned by get_chat_history. Never invent a message id.',
        },
      },
      required: ['messageId'],
      additionalProperties: false,
    },
  },
  execute: async (args) => {
    const { message, api } = requireToolContext()
    const chatId = message.chat?.id
    const getFile = api?.getFile?.bind(api)
    if (!chatId) throw new Error('No chat ID available')
    if (!getFile) throw new Error('Telegram media download is unavailable')

    try {
      const messageId = getMessageId(args.messageId)
      const history = await getRawHistory(chatId)
      const sourceMessage = history.find(
        (historyMessage) => historyMessage.message_id === messageId,
      )
      if (!sourceMessage) {
        throw new Error(
          `message_id ${messageId} is not available in the 24-hour chat history`,
        )
      }

      const refs = getMessageMediaRefs(sourceMessage).filter(
        (ref) => ref.mediaType === 'image',
      )
      if (!refs.length) {
        throw new Error(`message_id ${messageId} contains no supported images`)
      }

      const media = await resolveMediaBuffers(refs, { getFile })
      if (!media.length) {
        throw new Error(
          `images from message_id ${messageId} could not be loaded`,
        )
      }

      const registered = registerToolMediaBuffers(
        media.map((item) => ({ ...item, origin: 'history' as const })),
      )
      queueModelInspectionImages(registered)
      return registered
        .map(({ media: item, mediaId }) =>
          [
            `media_id=${mediaId}`,
            `message_id=${messageId}`,
            `type=${item.mediaType}`,
            `mime_type=${item.mimeType}`,
          ]
            .filter(Boolean)
            .join(' '),
        )
        .join('\n')
    } catch (error) {
      throw new Error(`Error loading chat media: ${getErrorMessage(error)}`)
    }
  },
}
