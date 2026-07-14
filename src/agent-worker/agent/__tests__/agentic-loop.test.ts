import { asSchema } from 'ai'
import type { Message } from 'grammy/types'

import { resolveHistoryMediaAttachments } from '@tg-bot/common'
import type { AgentTool, TelegramApi } from '../../types'
import {
  buildNativeTools,
  extractFallbackTextFromToolResults,
  extractSvgMarkup,
  filterToolsForRequest,
  getAgentDeliveryReplyMessageId,
  shouldIncludeHistoryMediaInModel,
  shouldUseDirectSvgRender,
} from '../agentic-loop'
import { CHAT_MODEL_CONFIG, resolveAgentChatModel } from '../models'

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

describe('buildNativeTools', () => {
  test('wraps legacy JSON parameters as AI SDK schemas', async () => {
    const tools = buildNativeTools([
      {
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
      } satisfies AgentTool,
    ])

    const lookupTool = tools.lookup
    expect(lookupTool).toBeDefined()
    expect(asSchema(lookupTool?.inputSchema).jsonSchema).toMatchObject({
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    })
  })
})

describe('filterToolsForRequest', () => {
  const codeTool = {
    declaration: {
      type: 'function',
      name: 'code_execution',
      description: 'Execute code',
    },
    execute: async () => 'ok',
  } satisfies AgentTool
  const renderTool = {
    declaration: {
      type: 'function',
      name: 'render_svg_to_png',
      description: 'Render SVG',
    },
    execute: async () => 'ok',
  } satisfies AgentTool
  const searchTool = {
    declaration: {
      type: 'function',
      name: 'web_search',
      description: 'Search web',
    },
    execute: async () => 'ok',
  } satisfies AgentTool

  test('removes code execution for visual render requests', () => {
    expect(
      filterToolsForRequest(
        [codeTool, renderTool, searchTool],
        'Построй PNG-график y = sin(x) + 0.25x',
      ).map((tool) => tool.declaration.name),
    ).toEqual(['render_svg_to_png'])
  })

  test('keeps code execution for ordinary calculations', () => {
    expect(
      filterToolsForRequest([codeTool, renderTool], 'посчитай 15% от 240').map(
        (tool) => tool.declaration.name,
      ),
    ).toEqual(['code_execution', 'render_svg_to_png'])
  })
})

describe('shouldIncludeHistoryMediaInModel', () => {
  test('does not include unrelated history media for creative SVG requests', () => {
    expect(
      shouldIncludeHistoryMediaInModel(
        '/qq нарисуй красивого пеликана на велосипеде в SVG',
        false,
      ),
    ).toBe(false)
  })

  test('includes history media when user explicitly asks about recent media', () => {
    expect(
      shouldIncludeHistoryMediaInModel('что на последнем фото?', false),
    ).toBe(true)
  })

  test('does not include history media when current message is a reply', () => {
    expect(
      shouldIncludeHistoryMediaInModel('что на последнем фото?', true),
    ).toBe(false)
  })
})

describe('shouldUseDirectSvgRender', () => {
  const renderTool = {
    declaration: {
      type: 'function',
      name: 'render_svg_to_png',
      description: 'Render SVG',
    },
    execute: async () => 'ok',
  } satisfies AgentTool

  test('uses direct SVG path for explicit SVG drawing requests', () => {
    expect(
      shouldUseDirectSvgRender(
        [renderTool],
        '/qq draw and show a beautiful pelican on a bicycle in SVG',
        false,
        false,
      ),
    ).toBe(true)
  })

  test('does not use direct SVG path for media/reply requests', () => {
    expect(
      shouldUseDirectSvgRender([renderTool], 'render this as SVG', true, false),
    ).toBe(false)
    expect(
      shouldUseDirectSvgRender([renderTool], 'render this as SVG', false, true),
    ).toBe(false)
  })
})

describe('extractSvgMarkup', () => {
  test('extracts SVG from fenced model output', () => {
    expect(
      extractSvgMarkup('```svg\n<svg><circle cx="1" cy="1" r="1"/></svg>\n```'),
    ).toBe('<svg><circle cx="1" cy="1" r="1"/></svg>')
  })
})

describe('extractFallbackTextFromToolResults', () => {
  test('uses successful tool output and ignores tool errors', () => {
    expect(
      extractFallbackTextFromToolResults([
        'Error searching web: service unavailable',
        'Fresh web result: current value is 42',
      ]),
    ).toBe('Fresh web result: current value is 42')
  })

  test('returns empty text when every tool failed', () => {
    expect(
      extractFallbackTextFromToolResults([
        'Error searching web: service unavailable',
        'Code execution failed: no output',
      ]),
    ).toBe('')
  })

  test('ignores descriptive code execution summaries as fallback text', () => {
    expect(
      extractFallbackTextFromToolResults([
        'The user provided Python code that generates an SVG path string.\n\nThe tool_code block executed the provided Python code, and the code_output block contains the generated SVG path string.\n\nI have no further questions and the output is generated as requested.',
      ]),
    ).toBe('')
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
