import { asSchema } from 'ai'
import type { Message } from 'grammy/types'

import { resolveHistoryMediaAttachments } from '@tg-bot/common'
import type { AgentTool, TelegramApi } from '../../types'
import {
  buildInitialInput,
  getAgentDeliveryReplyMessageId,
} from '../agentic-loop'
import { buildModelToolRegistry } from '../model-tools'
import { CHAT_MODEL_CONFIG, resolveAgentChatModel } from '../models'
import {
  extractFallbackTextFromToolResults,
  getExecutableFunctionCalls,
} from '../tool-loop'

describe('resolveAgentChatModel', () => {
  test('routes /o to GPT-5.6 with medium reasoning', () => {
    expect(resolveAgentChatModel('o')).toEqual({
      config: { provider: 'openai', model: 'gpt-5.6' },
      label: 'openai/gpt-5.6',
      reasoningEffort: 'medium',
    })
  })

  test('keeps other commands on the default chat model', () => {
    expect(resolveAgentChatModel('q').config).toBe(CHAT_MODEL_CONFIG)
  })
})

describe('buildModelToolRegistry', () => {
  test('wraps legacy JSON parameters as AI SDK schemas', async () => {
    const agentTool = {
      declaration: {
        type: 'function',
        name: 'lookup',
        description: 'Lookup something',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
      },
      execute: async () => 'ok',
    } satisfies AgentTool
    const { tools, toolByName } = buildModelToolRegistry([agentTool])

    const lookupTool = tools.lookup
    expect(lookupTool).toBeDefined()
    expect(toolByName.get('lookup')).toBe(agentTool)
    expect(asSchema(lookupTool?.inputSchema).jsonSchema).toMatchObject({
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    })
  })
})

describe('tool call normalization', () => {
  test('keeps object inputs and normalizes all other inputs', () => {
    expect(
      getExecutableFunctionCalls([
        { toolCallId: '1', toolName: 'lookup', input: { query: 'x' } },
        { toolCallId: '2', toolName: 'lookup', input: ['bad'] },
        { toolCallId: '3', toolName: '', input: { ignored: true } },
      ]),
    ).toEqual([
      { toolCallId: '1', name: 'lookup', args: { query: 'x' } },
      { toolCallId: '2', name: 'lookup', args: {} },
    ])
  })
})

describe('extractFallbackTextFromToolResults', () => {
  test('uses successful tool output and ignores tool errors', () => {
    expect(
      extractFallbackTextFromToolResults([
        {
          result: 'search service unavailable',
          status: 'error',
        },
        {
          result: 'Fresh web result: current value is 42',
          status: 'success',
        },
      ]),
    ).toBe('Fresh web result: current value is 42')
  })

  test('returns empty text when every tool failed', () => {
    expect(
      extractFallbackTextFromToolResults([
        { result: 'search service unavailable', status: 'error' },
        { result: 'code execution produced no output', status: 'error' },
      ]),
    ).toBe('')
  })

  test('does not infer status from successful result text', () => {
    expect(
      extractFallbackTextFromToolResults([
        {
          result: 'Error is a valid word in this successful result',
          status: 'success',
        },
      ]),
    ).toBe('Error is a valid word in this successful result')
  })
})

describe('getAgentDeliveryReplyMessageId', () => {
  test('uses reply target when stripped command has no own text', () => {
    expect(
      getAgentDeliveryReplyMessageId(
        {
          message_id: 10,
          text: '',
          reply_to_message: { message_id: 9 },
        } as Message,
        true,
      ),
    ).toBe(9)
  })

  test('keeps current message for non-command empty replies', () => {
    expect(
      getAgentDeliveryReplyMessageId({
        message_id: 10,
        text: '',
        reply_to_message: { message_id: 9 },
      } as Message),
    ).toBe(10)
  })

  test('keeps current message when command text remains after stripping', () => {
    expect(
      getAgentDeliveryReplyMessageId(
        {
          message_id: 10,
          text: 'explain this',
          reply_to_message: { message_id: 9 },
        } as Message,
        true,
      ),
    ).toBe(10)
  })

  test('uses current message when there is no reply target', () => {
    expect(
      getAgentDeliveryReplyMessageId({
        message_id: 10,
        text: '',
      } as Message),
    ).toBe(10)
  })
})

describe('buildInitialInput', () => {
  test('orders request media, reply context, history media, and user text', () => {
    const requestImage = {
      buffer: Buffer.from('request'),
      mimeType: 'image/png',
      mediaType: 'image' as const,
      label: 'Current image',
    }
    const historyImage = {
      buffer: Buffer.from('history'),
      mimeType: 'image/jpeg',
      mediaType: 'image' as const,
    }
    const message = {
      message_id: 10,
      text: 'compare them',
      reply_to_message: { message_id: 9, text: 'reply text' },
    } as Message

    expect(
      buildInitialInput(
        message,
        message.text ?? '',
        [requestImage],
        [
          {
            media: historyImage,
            message: { message_id: 8, caption: 'older photo' } as Message,
          },
        ],
      ),
    ).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Current image' },
          {
            type: 'image',
            image: requestImage.buffer,
            mediaType: 'image/png',
          },
          {
            type: 'text',
            text: 'Telegram reply target message_id=9: reply text',
          },
          {
            type: 'text',
            text: 'Context image from recent chat history. Related message text: older photo',
          },
          {
            type: 'image',
            image: historyImage.buffer,
            mediaType: 'image/jpeg',
          },
          { type: 'text', text: 'compare them' },
        ],
      },
    ])
  })
})

describe('resolveHistoryMediaAttachments', () => {
  const originalFetch = global.fetch
  const originalToken = process.env.TOKEN

  afterEach(() => {
    global.fetch = originalFetch
    process.env.TOKEN = originalToken
  })

  test('keeps message mapping when one history image download is skipped', async () => {
    process.env.TOKEN = 'test-token'

    const recentMessageA = {
      message_id: 11,
      text: 'first context message',
    } as unknown as Message
    const recentMessageB = {
      message_id: 12,
      text: 'second context message',
    } as unknown as Message

    const api = {
      getFile: jest.fn(async (fileId: string) => ({
        file_path: `${fileId}.jpg`,
      })),
    } as unknown as TelegramApi

    global.fetch = jest.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.includes('missing-image.jpg')) {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          arrayBuffer: async () => new ArrayBuffer(0),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
      } as Response
    }) as typeof fetch

    const resolved = await resolveHistoryMediaAttachments(
      [
        {
          ref: {
            fileId: 'missing-image',
            mimeType: 'image/jpeg',
            mediaType: 'image',
          },
          message: recentMessageA,
        },
        {
          ref: {
            fileId: 'available-image',
            mimeType: 'image/jpeg',
            mediaType: 'image',
          },
          message: recentMessageB,
        },
      ],
      api,
    )

    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.message).toBe(recentMessageB)
    expect(resolved[0]?.media.buffer.equals(Buffer.from([1, 2, 3]))).toBe(true)
  })
})
