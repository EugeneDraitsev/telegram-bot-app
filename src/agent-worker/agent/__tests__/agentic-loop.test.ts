import { asSchema } from 'ai'
import type { Message } from 'grammy/types'

import type { AgentTool } from '../../types'
import {
  buildInitialInput,
  getAgentDeliveryReplyMessageId,
} from '../agentic-loop'
import { buildModelToolRegistry } from '../model-tools'
import { CHAT_MODEL_CONFIG, resolveAgentChatModel } from '../models'
import { getChatProviderOptions } from '../runtime'
import {
  extractFallbackTextFromToolResults,
  getExecutableFunctionCalls,
} from '../tool-loop'

describe('resolveAgentChatModel', () => {
  test('routes /o to GPT-6 Astra with low reasoning in API requests', () => {
    expect(resolveAgentChatModel('o')).toEqual({
      config: { provider: 'openai', model: 'gpt-6-astra' },
      label: 'openai/gpt-6-astra',
      reasoningEffort: 'low',
    })
    expect(
      getChatProviderOptions(resolveAgentChatModel('o').config, 123).openai
        ?.reasoningEffort,
    ).toBe('low')
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
  test('orders request media and reply context without old history media', () => {
    const requestImage = {
      buffer: Buffer.from('request'),
      mimeType: 'image/png',
      mediaType: 'image' as const,
      label: 'Current image',
      origin: 'request' as const,
      context: {
        relation: 'current-message' as const,
        messageId: 10,
        text: 'compare them',
        author: 'Eugene',
      },
    }
    const historyImage = {
      buffer: Buffer.from('history'),
      mimeType: 'image/jpeg',
      mediaType: 'image' as const,
      origin: 'history' as const,
      label: 'History message image',
      context: {
        relation: 'history-message' as const,
        messageId: 8,
        text: 'older photo',
        author: 'Alice',
      },
    }
    const message = {
      message_id: 10,
      text: 'compare them',
      from: { id: 7, is_bot: false, first_name: 'Eugene' },
      reply_to_message: { message_id: 9, text: 'reply text' },
    } as Message

    expect(
      buildInitialInput(message, message.text ?? '', [
        requestImage,
        historyImage,
      ]),
    ).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'MEDIA_CONTEXT: each MEDIA belongs to the MESSAGE_CONTEXT immediately above it. Use media_id when a generation tool asks which media to use.',
          },
          {
            type: 'text',
            text: 'MESSAGE_CONTEXT relation=current-message\nmessage_id=10\ntext="compare them"\nauthor="Eugene"',
          },
          {
            type: 'text',
            text: 'MEDIA media_id=1 type=image mime_type=image/png\nlabel="Current image"',
          },
          {
            type: 'image',
            image: requestImage.buffer,
            mediaType: 'image/png',
          },
          {
            type: 'text',
            text: 'Telegram reply target message_id=9: reply text',
          },
          { type: 'text', text: 'CURRENT_USER_REQUEST:\ncompare them' },
        ],
      },
    ])
  })

  test('keeps video bytes out of the routing model input', () => {
    const requestVideo = {
      buffer: Buffer.from('video'),
      mimeType: 'video/mp4',
      mediaType: 'video' as const,
      label: 'Reply message video',
      origin: 'request' as const,
      context: {
        relation: 'reply-target' as const,
        messageId: 9,
        text: 'source clip',
        referencedByMessageId: 10,
        referencedByText: 'edit this',
      },
    }

    expect(
      buildInitialInput(
        { message_id: 10, text: 'edit this' } as Message,
        'edit this',
        [requestVideo],
      ),
    ).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'MEDIA_CONTEXT: each MEDIA belongs to the MESSAGE_CONTEXT immediately above it. Use media_id when a generation tool asks which media to use.',
          },
          {
            type: 'text',
            text: 'MESSAGE_CONTEXT relation=reply-target\nmessage_id=9\ntext="source clip"\nreferenced_by_message_id=10\nreferenced_by_text="edit this"',
          },
          {
            type: 'text',
            text: 'MEDIA media_id=1 type=video mime_type=video/mp4\nlabel="Reply message video"',
          },
          {
            type: 'text',
            text: 'Binary video media_id=1 is available to media-generation tools.',
          },
          { type: 'text', text: 'CURRENT_USER_REQUEST:\nedit this' },
        ],
      },
    ])
  })

  test('forwards audio bytes to the routing model as a file part', () => {
    const requestAudio = {
      buffer: Buffer.from('voice'),
      mimeType: 'audio/ogg',
      mediaType: 'audio' as const,
      label: 'Current voice message',
      origin: 'request' as const,
      context: {
        relation: 'current-message' as const,
        messageId: 10,
        text: 'what did I say?',
      },
    }

    const [input] = buildInitialInput(
      { message_id: 10, text: 'what did I say?' } as Message,
      'what did I say?',
      [requestAudio],
    )

    expect(input?.content).toContainEqual({
      type: 'file',
      data: requestAudio.buffer,
      mediaType: 'audio/ogg',
    })
    expect(input?.content).not.toContainEqual(
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('Binary audio'),
      }),
    )
  })
})
