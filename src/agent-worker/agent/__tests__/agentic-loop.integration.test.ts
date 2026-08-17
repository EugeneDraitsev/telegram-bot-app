import type { Message } from 'grammy/types'

import * as common from '@tg-bot/common'
import * as agentTools from '../../tools'
import type { AgentTool, TelegramApi } from '../../types'
import { runAgenticLoop } from '../agentic-loop'
import * as delivery from '../delivery'
import * as modelCall from '../model-call'
import { CHAT_MODEL_CONFIG } from '../models'
import * as replyGate from '../reply-gate'

const stopThinking = jest.fn()
const stopTyping = jest.fn()

function createMessage(text = 'bot, answer this'): Message {
  return {
    message_id: 10,
    date: 1_750_000_000,
    chat: { id: 123, type: 'group', title: 'Test chat' },
    from: { id: 7, is_bot: false, first_name: 'Eugene' },
    text,
  }
}

function createApi(): TelegramApi {
  return {
    getFile: jest.fn(),
    getChatMember: jest.fn(),
    sendMessage: jest.fn().mockResolvedValue({ message_id: 11 }),
    sendPhoto: jest.fn(),
    sendAudio: jest.fn(),
    sendVoice: jest.fn(),
    sendVideo: jest.fn(),
    sendAnimation: jest.fn(),
    sendSticker: jest.fn(),
    sendDice: jest.fn(),
    sendChatAction: jest.fn().mockResolvedValue(true),
    sendRichMessage: jest.fn(),
    sendRichMessageDraft: jest.fn(),
    setMessageReaction: jest.fn().mockResolvedValue(true),
  } as unknown as TelegramApi
}

function createModelResult(options: {
  text?: string
  toolCalls?: Array<{
    toolCallId: string
    toolName: string
    input: unknown
  }>
}) {
  const text = options.text ?? ''
  const toolCalls = options.toolCalls ?? []
  return {
    model: 'openai/gpt-5.6-luna',
    modelConfig: CHAT_MODEL_CONFIG,
    response: {
      text,
      content: text ? [{ type: 'text', text }] : [],
      toolCalls,
      response: { messages: [] },
    },
  } as unknown as Awaited<
    ReturnType<typeof modelCall.generateModelWithRetryWithInfo>
  >
}

describe('runAgenticLoop integration', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    stopThinking.mockClear()
    stopTyping.mockClear()

    jest.spyOn(common, 'getChatMemory').mockResolvedValue('')
    jest.spyOn(common, 'getGlobalMemory').mockResolvedValue('')
    jest.spyOn(common, 'getRecentRawHistory').mockResolvedValue([])
    jest
      .spyOn(common, 'startThinkingRichDraftIndicator')
      .mockReturnValue(stopThinking)
    jest.spyOn(common, 'startTypingIndicator').mockReturnValue(stopTyping)
    jest.spyOn(common, 'recordMetric').mockResolvedValue(undefined)
    jest
      .spyOn(agentTools, 'executeDynamicCommandFromMessage')
      .mockResolvedValue({ matched: false })
    jest.spyOn(agentTools, 'getAgentTools').mockResolvedValue([])
    jest.spyOn(agentTools, 'getBaseAgentTools').mockReturnValue([])
    jest.spyOn(replyGate, 'shouldEngageWithMessage').mockResolvedValue(true)
    jest.spyOn(delivery, 'sendResponses').mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('delivers a dynamic command without loading memory or calling a model', async () => {
    jest
      .spyOn(agentTools, 'executeDynamicCommandFromMessage')
      .mockResolvedValue({ matched: true, name: 'hello', result: 'world' })
    const modelSpy = jest.spyOn(modelCall, 'generateModelWithRetryWithInfo')

    await runAgenticLoop(createMessage('/hello'), createApi())

    expect(delivery.sendResponses).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 123,
        replyToMessageId: 10,
        responses: [{ type: 'text', text: 'world' }],
      }),
    )
    expect(common.getChatMemory).not.toHaveBeenCalled()
    expect(modelSpy).not.toHaveBeenCalled()
  })

  test('stops after the reply gate rejects a message', async () => {
    jest.spyOn(replyGate, 'shouldEngageWithMessage').mockResolvedValue(false)
    const modelSpy = jest.spyOn(modelCall, 'generateModelWithRetryWithInfo')

    await runAgenticLoop(createMessage('group chatter'), createApi())

    expect(modelSpy).not.toHaveBeenCalled()
    expect(agentTools.getAgentTools).not.toHaveBeenCalled()
    expect(delivery.sendResponses).not.toHaveBeenCalled()
  })

  test('loads context and delivers a plain model response', async () => {
    jest
      .spyOn(common, 'getChatMemory')
      .mockRejectedValue(new Error('redis down'))
    jest
      .spyOn(modelCall, 'generateModelWithRetryWithInfo')
      .mockResolvedValue(createModelResult({ text: 'final answer' }))
    const api = createApi()

    await runAgenticLoop(createMessage(), api, undefined, undefined, {
      bypassReplyGate: true,
      commandName: 'q',
    })

    expect(replyGate.shouldEngageWithMessage).not.toHaveBeenCalled()
    expect(agentTools.getAgentTools).toHaveBeenCalledWith(123)
    expect(delivery.sendResponses).toHaveBeenCalledWith(
      expect.objectContaining({
        responses: [{ type: 'text', text: 'final answer' }],
      }),
    )
    expect(api.setMessageReaction).toHaveBeenCalled()
    expect(stopThinking).toHaveBeenCalledTimes(1)
    expect(stopTyping).toHaveBeenCalledTimes(1)
  })

  test('executes a tool and feeds its result into the next model round', async () => {
    const execute = jest.fn().mockResolvedValue('lookup result: 42')
    const lookupTool: AgentTool = {
      declaration: {
        type: 'function',
        name: 'lookup',
        description: 'Look up a value',
      },
      execute,
    }
    jest.spyOn(agentTools, 'getAgentTools').mockResolvedValue([lookupTool])
    const modelSpy = jest
      .spyOn(modelCall, 'generateModelWithRetryWithInfo')
      .mockResolvedValueOnce(
        createModelResult({
          toolCalls: [
            {
              toolCallId: 'call-1',
              toolName: 'lookup',
              input: { query: 'value' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(createModelResult({ text: 'The value is 42' }))
      .mockRejectedValue(new Error('unexpected extra model call'))

    await runAgenticLoop(createMessage(), createApi(), undefined, undefined, {
      bypassReplyGate: true,
    })

    expect(execute).toHaveBeenCalledWith({ query: 'value' })
    expect(modelSpy).toHaveBeenCalledTimes(2)
    expect(modelSpy.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'tool' }),
        ]),
      }),
    )
    expect(delivery.sendResponses).toHaveBeenCalledWith(
      expect.objectContaining({
        responses: [{ type: 'text', text: 'The value is 42' }],
      }),
    )
  })

  test('passes thrown tool failures as structured error results', async () => {
    const lookupTool: AgentTool = {
      declaration: {
        type: 'function',
        name: 'lookup',
        description: 'Look up a value',
      },
      execute: jest.fn().mockRejectedValue(new Error('service unavailable')),
    }
    jest.spyOn(agentTools, 'getAgentTools').mockResolvedValue([lookupTool])
    const modelSpy = jest
      .spyOn(modelCall, 'generateModelWithRetryWithInfo')
      .mockResolvedValueOnce(
        createModelResult({
          toolCalls: [
            {
              toolCallId: 'call-1',
              toolName: 'lookup',
              input: { query: 'value' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResult({ text: 'I could not verify the value.' }),
      )

    await runAgenticLoop(createMessage(), createApi(), undefined, undefined, {
      bypassReplyGate: true,
    })

    expect(modelSpy.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'tool',
            content: [
              expect.objectContaining({
                output: {
                  type: 'error-text',
                  value: 'service unavailable',
                },
              }),
            ],
          }),
        ]),
      }),
    )
  })

  test('defers content tools until data tools finish and stops after terminal media', async () => {
    const search = jest.fn().mockResolvedValue('fresh data')
    const generateVoice = jest.fn(async () => {
      agentTools.addResponse({ type: 'voice', buffer: Buffer.from('voice') })
      return 'Generated voice'
    })
    const tools: AgentTool[] = [
      {
        declaration: {
          type: 'function',
          name: 'web_search',
          description: 'Search',
        },
        execution: ['serial'],
        execute: search,
      },
      {
        declaration: {
          type: 'function',
          name: 'generate_voice',
          description: 'Generate voice',
        },
        execution: ['after-data', 'terminal'],
        execute: generateVoice,
      },
    ]
    jest.spyOn(agentTools, 'getAgentTools').mockResolvedValue(tools)
    const modelSpy = jest
      .spyOn(modelCall, 'generateModelWithRetryWithInfo')
      .mockResolvedValueOnce(
        createModelResult({
          toolCalls: [
            {
              toolCallId: 'search-1',
              toolName: 'web_search',
              input: { query: 'today' },
            },
            {
              toolCallId: 'voice-1',
              toolName: 'generate_voice',
              input: { text: 'premature' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResult({
          toolCalls: [
            {
              toolCallId: 'voice-2',
              toolName: 'generate_voice',
              input: { text: 'fresh data' },
            },
          ],
        }),
      )
      .mockRejectedValue(new Error('unexpected extra model call'))

    await runAgenticLoop(createMessage(), createApi(), undefined, undefined, {
      bypassReplyGate: true,
    })

    expect(search).toHaveBeenCalledTimes(1)
    expect(generateVoice).toHaveBeenCalledTimes(1)
    expect(generateVoice).toHaveBeenCalledWith({ text: 'fresh data' })
    expect(modelSpy).toHaveBeenCalledTimes(2)
    expect(delivery.sendResponses).toHaveBeenCalledWith(
      expect.objectContaining({
        responses: [
          expect.objectContaining({
            type: 'voice',
            buffer: Buffer.from('voice'),
          }),
        ],
      }),
    )
  })

  test('falls back to successful tool output when later synthesis fails', async () => {
    const lookupTool: AgentTool = {
      declaration: {
        type: 'function',
        name: 'lookup',
        description: 'Lookup',
      },
      execute: jest.fn().mockResolvedValue('verified result: 42'),
    }
    jest.spyOn(agentTools, 'getAgentTools').mockResolvedValue([lookupTool])
    jest
      .spyOn(modelCall, 'generateModelWithRetryWithInfo')
      .mockResolvedValueOnce(
        createModelResult({
          toolCalls: [
            {
              toolCallId: 'lookup-1',
              toolName: 'lookup',
              input: {},
            },
          ],
        }),
      )
      .mockRejectedValue(new Error('model unavailable'))

    await runAgenticLoop(createMessage(), createApi(), undefined, undefined, {
      bypassReplyGate: true,
    })

    expect(delivery.sendResponses).toHaveBeenCalledWith(
      expect.objectContaining({
        responses: [{ type: 'text', text: 'verified result: 42' }],
      }),
    )
  })

  test('uses the explicit no-response fallback after empty model output', async () => {
    jest
      .spyOn(modelCall, 'generateModelWithRetryWithInfo')
      .mockResolvedValue(createModelResult({}))

    await runAgenticLoop(createMessage(), createApi(), undefined, undefined, {
      bypassReplyGate: true,
    })

    expect(delivery.sendResponses).toHaveBeenCalledWith(
      expect.objectContaining({
        responses: [
          {
            type: 'text',
            text: 'Не смог собрать ответ по этому запросу. Попробуй переформулировать.',
          },
        ],
      }),
    )
  })

  test('lets the main model choose the SVG tool and delivers its image', async () => {
    const renderTool: AgentTool = {
      declaration: {
        type: 'function',
        name: 'render_svg_to_png',
        description: 'Render SVG',
      },
      execution: ['after-data', 'terminal'],
      execute: jest.fn(async () => {
        agentTools.addResponse({ type: 'image', buffer: Buffer.from('png') })
        return 'Rendered SVG to PNG (3 bytes)'
      }),
    }
    jest.spyOn(agentTools, 'getAgentTools').mockResolvedValue([renderTool])
    const modelSpy = jest
      .spyOn(modelCall, 'generateModelWithRetryWithInfo')
      .mockResolvedValueOnce(
        createModelResult({
          toolCalls: [
            {
              toolCallId: 'svg-call',
              toolName: 'render_svg_to_png',
              input: { svg: '<svg><circle r="10"/></svg>' },
            },
          ],
        }),
      )
      .mockRejectedValue(new Error('unexpected extra model call'))

    await runAgenticLoop(
      createMessage('/qq draw and show a graph in SVG'),
      createApi(),
      undefined,
      undefined,
      { bypassReplyGate: true, commandName: 'qq' },
    )

    expect(renderTool.execute).toHaveBeenCalledWith({
      svg: '<svg><circle r="10"/></svg>',
    })
    expect(modelSpy).toHaveBeenCalledTimes(1)
    expect(delivery.sendResponses).toHaveBeenCalledWith(
      expect.objectContaining({
        responses: [
          expect.objectContaining({
            type: 'image',
            buffer: Buffer.from('png'),
          }),
        ],
      }),
    )
  })

  test('keeps every tool available for mixed render requests', async () => {
    const renderTool: AgentTool = {
      declaration: {
        type: 'function',
        name: 'render_svg_to_png',
        description: 'Render SVG',
      },
      execute: jest.fn().mockResolvedValue('rendered'),
    }
    const searchTool: AgentTool = {
      declaration: {
        type: 'function',
        name: 'web_search',
        description: 'Search the web',
      },
      execute: jest.fn().mockResolvedValue('fresh data'),
    }
    jest
      .spyOn(agentTools, 'getAgentTools')
      .mockResolvedValue([searchTool, renderTool])
    const modelSpy = jest
      .spyOn(modelCall, 'generateModelWithRetryWithInfo')
      .mockResolvedValue(createModelResult({ text: 'done' }))

    await runAgenticLoop(
      createMessage('search current data and draw an SVG chart'),
      createApi(),
      undefined,
      undefined,
      { bypassReplyGate: true },
    )

    expect(Object.keys(modelSpy.mock.calls[0]?.[0].tools ?? {})).toEqual([
      'web_search',
      'render_svg_to_png',
    ])
  })

  test('always includes resolved history images in the main model input', async () => {
    const historyMessage = {
      ...createMessage('older photo'),
      message_id: 8,
      photo: [
        {
          file_id: 'history-file',
          file_unique_id: 'history-unique',
          width: 100,
          height: 100,
        },
      ],
    } as Message
    const historyBuffer = Buffer.from('history-image')
    jest
      .spyOn(common, 'getRecentRawHistory')
      .mockResolvedValue([historyMessage])
    jest.spyOn(common, 'resolveHistoryMediaAttachments').mockResolvedValue([
      {
        message: historyMessage,
        media: {
          buffer: historyBuffer,
          mimeType: 'image/jpeg',
          mediaType: 'image',
        },
      },
    ])
    const modelSpy = jest
      .spyOn(modelCall, 'generateModelWithRetryWithInfo')
      .mockResolvedValue(createModelResult({ text: 'answer' }))

    await runAgenticLoop(
      createMessage('ordinary request without image keywords'),
      createApi(),
      undefined,
      undefined,
      { bypassReplyGate: true },
    )

    expect(modelSpy.mock.calls[0]?.[0].messages).toEqual([
      expect.objectContaining({
        content: expect.arrayContaining([
          {
            type: 'file',
            data: historyBuffer,
            mediaType: 'image/jpeg',
          },
        ]),
      }),
    ])
  })

  test('sends a user-facing failure and always stops indicators', async () => {
    const error = Object.assign(new Error('model overloaded'), { status: 503 })
    jest
      .spyOn(modelCall, 'generateModelWithRetryWithInfo')
      .mockRejectedValue(error)
    const api = createApi()

    await runAgenticLoop(createMessage(), api, undefined, undefined, {
      bypassReplyGate: true,
    })

    expect(api.sendMessage).toHaveBeenCalledWith(
      123,
      'Сервис ответа сейчас перегружен. Попробуй ещё раз чуть позже.',
      { reply_parameters: { message_id: 10 } },
    )
    expect(delivery.sendResponses).not.toHaveBeenCalled()
    expect(stopThinking).toHaveBeenCalledTimes(1)
    expect(stopTyping).toHaveBeenCalledTimes(1)
  })

  test('retries a failure reply without reply parameters when target is gone', async () => {
    jest
      .spyOn(modelCall, 'generateModelWithRetryWithInfo')
      .mockRejectedValue(new Error('unexpected failure'))
    const api = createApi()
    const sendMessage = api.sendMessage as jest.Mock
    sendMessage
      .mockRejectedValueOnce({
        error_code: 400,
        description: 'Bad Request: message to be replied not found',
      })
      .mockResolvedValueOnce({ message_id: 11 })

    await runAgenticLoop(createMessage(), api, undefined, undefined, {
      bypassReplyGate: true,
    })

    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      123,
      'Что-то пошло не так 😵',
      { reply_parameters: { message_id: 10 } },
    )
    expect(sendMessage).toHaveBeenNthCalledWith(
      2,
      123,
      'Что-то пошло не так 😵',
    )
  })

  test('returns early for malformed messages without a chat id', async () => {
    const modelSpy = jest.spyOn(modelCall, 'generateModelWithRetryWithInfo')

    await runAgenticLoop({ message_id: 10 } as Message, createApi())

    expect(modelSpy).not.toHaveBeenCalled()
    expect(delivery.sendResponses).not.toHaveBeenCalled()
  })
})
