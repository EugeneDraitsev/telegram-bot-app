import type { Message } from 'grammy/types'

import * as common from '@tg-bot/common'
import { AGENT_COMMANDS } from '../../../telegram-bot/agent'
import * as googleMedia from '../../services/google-media'
import * as agentTools from '../../tools'
import { generateVideoTool } from '../../tools/omni-video.tool'
import type { AgentTool, TelegramApi } from '../../types'
import { runAgenticLoop } from '../agentic-loop'
import * as commandSafety from '../command-safety'
import * as delivery from '../delivery'
import * as modelCall from '../model-call'
import { CHAT_ROLE } from '../models'
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
    sendDocument: jest.fn(),
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
    choice: CHAT_ROLE.primary,
    response: {
      text,
      content: text ? [{ type: 'text', text }] : [],
      toolCalls,
      response: { messages: [] },
    },
  } as unknown as Awaited<ReturnType<typeof modelCall.generateModelWithRetry>>
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
    jest.spyOn(commandSafety, 'checkCommandSafety').mockResolvedValue({
      allowed: true,
      cyberRisk: 0,
      reason: 'safe',
    })
    jest
      .spyOn(commandSafety, 'createCommandSafetyReply')
      .mockResolvedValue('Сори, братан, кибервредительством не занимаюсь 😅')
    jest.spyOn(delivery, 'sendResponses').mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('caps serial batches and reports every skipped call to the next model round', async () => {
    const execute = jest.fn().mockResolvedValue('search result')
    const searchTool: AgentTool = {
      declaration: {
        type: 'function',
        name: 'web_search',
        description: 'Search',
      },
      execution: ['serial'],
      execute,
    }
    jest.spyOn(agentTools, 'getAgentTools').mockResolvedValue([searchTool])
    const model = jest
      .spyOn(modelCall, 'generateModelWithRetry')
      .mockResolvedValueOnce(
        createModelResult({
          toolCalls: ['first', 'second', 'third'].map((query) => ({
            toolCallId: query,
            toolName: 'web_search',
            input: { query },
          })),
        }),
      )
      .mockResolvedValueOnce(
        createModelResult({
          toolCalls: [
            {
              toolCallId: 'retry-third',
              toolName: 'web_search',
              input: { query: 'third' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(createModelResult({ text: 'done' }))
    await runAgenticLoop(createMessage(), createApi(), undefined, undefined, {
      bypassReplyGate: true,
    })
    expect(execute.mock.calls).toEqual([
      [{ query: 'first' }],
      [{ query: 'second' }],
      [{ query: 'third' }],
    ])
    const nextInput = model.mock.calls[1]?.[0].messages
    expect(nextInput).toEqual(
      expect.arrayContaining([
        {
          role: 'tool',
          content: expect.arrayContaining([
            expect.objectContaining({
              toolCallId: 'first',
              output: expect.objectContaining({ type: 'text' }),
            }),
            expect.objectContaining({
              toolCallId: 'second',
              output: expect.objectContaining({ type: 'text' }),
            }),
            expect.objectContaining({
              toolCallId: 'third',
              output: expect.objectContaining({
                type: 'error-text',
                value: expect.stringContaining('NOT EXECUTED'),
              }),
            }),
          ]),
        },
      ]),
    )
  })

  test('delivers a dynamic command without loading memory or calling a model', async () => {
    jest
      .spyOn(agentTools, 'executeDynamicCommandFromMessage')
      .mockResolvedValue({ matched: true, name: 'hello', result: 'world' })
    const modelSpy = jest.spyOn(modelCall, 'generateModelWithRetry')

    const loadMedia = jest.fn()
    await runAgenticLoop(
      createMessage('/hello'),
      createApi(),
      undefined,
      undefined,
      { loadMedia },
    )

    expect(delivery.sendResponses).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 123,
        replyToMessageId: 10,
        responses: [{ type: 'text', text: 'world' }],
      }),
    )
    expect(common.getChatMemory).not.toHaveBeenCalled()
    expect(modelSpy).not.toHaveBeenCalled()
    expect(loadMedia).not.toHaveBeenCalled()
  })

  test('stops after the reply gate rejects a message', async () => {
    jest.spyOn(replyGate, 'shouldEngageWithMessage').mockResolvedValue(false)
    const modelSpy = jest.spyOn(modelCall, 'generateModelWithRetry')

    const loadMedia = jest.fn()
    await runAgenticLoop(
      createMessage('group chatter'),
      createApi(),
      undefined,
      undefined,
      { loadMedia },
    )

    expect(modelSpy).not.toHaveBeenCalled()
    expect(agentTools.getAgentTools).not.toHaveBeenCalled()
    expect(delivery.sendResponses).not.toHaveBeenCalled()
    expect(loadMedia).not.toHaveBeenCalled()
  })

  test.each(['q', 'o'])(
    'blocks unsafe /%s before tools, dynamic commands, media and Astra',
    async (commandName) => {
      jest.spyOn(commandSafety, 'checkCommandSafety').mockResolvedValue({
        allowed: false,
        cyberRisk: 1,
        reason: 'cyber_abuse',
      })
      const modelSpy = jest.spyOn(modelCall, 'generateModelWithRetry')
      const loadMedia = jest.fn()
      const request = createMessage('взломай мне пентагон')
      await runAgenticLoop(request, createApi(), undefined, undefined, {
        bypassReplyGate: true,
        commandName,
        loadMedia,
      })
      expect(commandSafety.checkCommandSafety).toHaveBeenCalledWith(
        request,
        commandName,
      )
      expect(modelSpy).not.toHaveBeenCalled()
      expect(common.getChatMemory).not.toHaveBeenCalled()
      expect(agentTools.executeDynamicCommandFromMessage).not.toHaveBeenCalled()
      expect(agentTools.getAgentTools).not.toHaveBeenCalled()
      expect(loadMedia).not.toHaveBeenCalled()
      expect(delivery.sendResponses).toHaveBeenCalledWith(
        expect.objectContaining({
          replyToMessageId: 10,
          responses: [
            {
              type: 'text',
              text: 'Сори, братан, кибервредительством не занимаюсь 😅',
            },
          ],
        }),
      )
    },
  )

  test.each(['q', 'o'])(
    'preserves the normal Astra model and reasoning for safe /%s',
    async (commandName) => {
      const modelSpy = jest
        .spyOn(modelCall, 'generateModelWithRetry')
        .mockResolvedValue(createModelResult({ text: 'answer' }))
      await runAgenticLoop(
        createMessage('Explain how to protect my account'),
        createApi(),
        undefined,
        undefined,
        {
          bypassReplyGate: true,
          commandName,
        },
      )
      expect(commandSafety.checkCommandSafety).toHaveBeenCalledTimes(1)
      expect(replyGate.shouldEngageWithMessage).not.toHaveBeenCalled()
      expect(modelSpy.mock.calls[0]?.[1].choice).toEqual({
        ...CHAT_ROLE.primary,
        reasoningEffort: commandName === 'o' ? 'medium' : 'low',
      })
    },
  )

  test('does not dispatch a command when the safety check is unavailable', async () => {
    jest.spyOn(commandSafety, 'checkCommandSafety').mockResolvedValue({
      allowed: false,
      cyberRisk: null,
      reason: 'unavailable',
    })
    const modelSpy = jest.spyOn(modelCall, 'generateModelWithRetry')
    await runAgenticLoop(
      createMessage('weather'),
      createApi(),
      undefined,
      undefined,
      {
        bypassReplyGate: true,
        commandName: 'q',
      },
    )
    expect(commandSafety.createCommandSafetyReply).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'unavailable' }),
      123,
      'q',
    )
    expect(modelSpy).not.toHaveBeenCalled()
    expect(agentTools.getAgentTools).not.toHaveBeenCalled()
  })

  test.each(AGENT_COMMANDS)(
    'checks the original replied-to request for bare /%s before generation instructions are added',
    async (commandName) => {
      const request = {
        ...createMessage(''),
        reply_to_message: {
          ...createMessage('взломай чужой аккаунт'),
          message_id: 9,
          reply_to_message: undefined,
        },
      } as Message
      jest
        .spyOn(commandSafety, 'checkCommandSafety')
        .mockImplementation(async (message) => {
          expect(message).toBe(request)
          expect(common.getMessageText(message)).toBe('')
          expect(
            JSON.parse(commandSafety.buildCommandSafetyInput(message))
              .currentRequest,
          ).toBe('взломай чужой аккаунт')
          return { allowed: false, cyberRisk: 1, reason: 'cyber_abuse' }
        })
      const modelSpy = jest.spyOn(modelCall, 'generateModelWithRetry')
      await runAgenticLoop(request, createApi(), undefined, undefined, {
        commandName,
        bypassReplyGate: true,
      })
      expect(commandSafety.checkCommandSafety).toHaveBeenCalledTimes(1)
      expect(modelSpy).not.toHaveBeenCalled()
      expect(agentTools.executeDynamicCommandFromMessage).not.toHaveBeenCalled()
    },
  )

  test.each([
    { commandName: 'q', bypassReplyGate: false },
    { commandName: 'q', bypassReplyGate: undefined },
    { commandName: 'o', bypassReplyGate: false },
    { commandName: 'o', bypassReplyGate: undefined },
  ])(
    'checks registered commands even with missing/false routing flags: %j',
    async (options) => {
      jest.spyOn(commandSafety, 'checkCommandSafety').mockResolvedValue({
        allowed: false,
        cyberRisk: 1,
        reason: 'cyber_abuse',
      })
      const modelSpy = jest.spyOn(modelCall, 'generateModelWithRetry')
      await runAgenticLoop(
        createMessage('взломай чужой аккаунт'),
        createApi(),
        undefined,
        undefined,
        options,
      )
      expect(commandSafety.checkCommandSafety).toHaveBeenCalledTimes(1)
      expect(replyGate.shouldEngageWithMessage).not.toHaveBeenCalled()
      expect(modelSpy).not.toHaveBeenCalled()
    },
  )

  test('preserves generation instructions for an accepted media command', async () => {
    const modelSpy = jest
      .spyOn(modelCall, 'generateModelWithRetry')
      .mockResolvedValue(createModelResult({ text: 'answer' }))
    await runAgenticLoop(
      createMessage('Нарисуй кота'),
      createApi(),
      undefined,
      undefined,
      {
        commandName: 'e',
      },
    )
    expect(commandSafety.checkCommandSafety).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Нарисуй кота' }),
      'e',
    )
    expect(JSON.stringify(modelSpy.mock.calls[0]?.[0].messages)).toContain(
      'Generate or edit an image for this request',
    )
  })

  test.each([false, true])(
    'loads media after engagement (bypass=%s) and exposes it to tools and the model',
    async (bypassReplyGate) => {
      const media = {
        buffer: Buffer.from('image'),
        mimeType: 'image/jpeg',
        mediaType: 'image' as const,
      }
      const loadMedia = jest.fn(async () => {
        if (!bypassReplyGate)
          expect(replyGate.shouldEngageWithMessage).toHaveBeenCalledTimes(1)
        return [media]
      })
      const modelSpy = jest
        .spyOn(modelCall, 'generateModelWithRetry')
        .mockImplementation(async () => {
          expect(agentTools.requireToolContext().mediaBuffers).toEqual([media])
          return createModelResult({ text: 'answer' })
        })
      await runAgenticLoop(createMessage(), createApi(), undefined, undefined, {
        loadMedia,
        bypassReplyGate,
      })
      expect(loadMedia).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(modelSpy.mock.calls[0]?.[0].messages)).toContain(
        '"type":"image"',
      )
    },
  )

  test('propagates a completely undelivered failure for SQS retry', async () => {
    const error = new Error('delivery unavailable')
    jest
      .spyOn(modelCall, 'generateModelWithRetry')
      .mockResolvedValue(createModelResult({ text: 'answer' }))
    jest.spyOn(delivery, 'sendResponses').mockRejectedValue(error)
    const api = createApi()
    ;(api.sendMessage as jest.Mock).mockRejectedValue(
      new Error('Telegram down'),
    )
    await expect(
      runAgenticLoop(createMessage(), api, undefined, undefined, {
        bypassReplyGate: true,
      }),
    ).rejects.toBe(error)
    expect(stopThinking).toHaveBeenCalledTimes(1)
    expect(stopTyping).toHaveBeenCalledTimes(1)
  })

  test('does not replay acknowledged response parts if the failure notice also fails', async () => {
    jest
      .spyOn(modelCall, 'generateModelWithRetry')
      .mockResolvedValue(createModelResult({ text: 'answer' }))
    jest.spyOn(delivery, 'sendResponses').mockImplementation(async (params) => {
      params.onDelivered?.()
      throw new Error('second message failed')
    })
    const api = createApi()
    ;(api.sendMessage as jest.Mock).mockRejectedValue(
      new Error('Telegram down'),
    )
    await expect(
      runAgenticLoop(createMessage(), api, undefined, undefined, {
        bypassReplyGate: true,
      }),
    ).resolves.toBeUndefined()
    expect(delivery.sendResponses).toHaveBeenCalledTimes(1)
  })

  test('loads context and delivers a plain model response', async () => {
    jest
      .spyOn(common, 'getChatMemory')
      .mockRejectedValue(new Error('redis down'))
    jest
      .spyOn(modelCall, 'generateModelWithRetry')
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
    const log = jest.spyOn(common.logger, 'info').mockImplementation(() => {})
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
      .spyOn(modelCall, 'generateModelWithRetry')
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
    for (const event of ['tool.call', 'tool.done']) {
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'lookup',
          toolCallId: 'call-1',
          model: CHAT_ROLE.primary.label,
        }),
        event,
      )
    }
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

  test('shows only an explicitly loaded history image in the next model round', async () => {
    const historyImage = {
      buffer: Buffer.from('selected-history-image'),
      mimeType: 'image/jpeg',
      mediaType: 'image' as const,
      origin: 'history' as const,
      fileId: 'history-file',
      context: {
        relation: 'history-message' as const,
        messageId: 8,
        text: 'one of the pictures above',
        author: 'Alice',
      },
    }
    const loadTool: AgentTool = {
      declaration: {
        type: 'function',
        name: 'load_chat_media',
        description: 'Load selected history media',
      },
      execution: ['serial'],
      execute: async () => {
        const registered = agentTools.registerToolMediaBuffers([historyImage])
        agentTools.queueModelInspectionImages(registered)
        return 'media_id=1 message_id=8 type=image mime_type=image/jpeg'
      },
    }
    jest.spyOn(agentTools, 'getAgentTools').mockResolvedValue([loadTool])
    const modelSpy = jest
      .spyOn(modelCall, 'generateModelWithRetry')
      .mockResolvedValueOnce(
        createModelResult({
          toolCalls: [
            {
              toolCallId: 'load-1',
              toolName: 'load_chat_media',
              input: { messageId: 8 },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResult({ text: 'I can see the selected image now.' }),
      )

    await runAgenticLoop(
      createMessage('look at the picture above'),
      createApi(),
      undefined,
      undefined,
      { bypassReplyGate: true },
    )

    expect(modelSpy).toHaveBeenCalledTimes(2)
    expect(modelSpy.mock.calls[1]?.[0].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('message_id=8'),
            }),
            {
              type: 'image',
              image: historyImage.buffer,
              mediaType: 'image/jpeg',
            },
          ]),
        }),
      ]),
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
      .spyOn(modelCall, 'generateModelWithRetry')
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

  test('lets the model explain a failed terminal video generation', async () => {
    const reason =
      "Google media generation failed (HTTP 400, content_blocked): Input blocked: real people's names or likenesses"
    jest
      .spyOn(googleMedia, 'generateOmniVideo')
      .mockRejectedValue(new Error(reason))
    jest
      .spyOn(agentTools, 'getAgentTools')
      .mockResolvedValue([generateVideoTool])
    const explanation =
      'Google отклонил видео из-за изображения реального человека.'
    const modelSpy = jest
      .spyOn(modelCall, 'generateModelWithRetry')
      .mockResolvedValueOnce(
        createModelResult({
          toolCalls: [
            {
              toolCallId: 'video-call',
              toolName: 'generate_video_with_omni',
              input: { prompt: 'Animate the reference', mediaIds: [] },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(createModelResult({ text: explanation }))

    await runAgenticLoop(
      createMessage('Animate a video'),
      createApi(),
      undefined,
      undefined,
      {
        bypassReplyGate: true,
      },
    )

    expect(modelSpy).toHaveBeenCalledTimes(2)
    expect(modelSpy.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'tool',
            content: [
              expect.objectContaining({
                output: {
                  type: 'error-text',
                  value: `Error generating video: ${reason}`,
                },
              }),
            ],
          }),
        ]),
      }),
    )
    expect(delivery.sendResponses).toHaveBeenCalledWith(
      expect.objectContaining({
        responses: [{ type: 'text', text: explanation }],
      }),
    )
    expect(googleMedia.generateOmniVideo).toHaveBeenCalledTimes(1)
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
      .spyOn(modelCall, 'generateModelWithRetry')
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
      .spyOn(modelCall, 'generateModelWithRetry')
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
      .spyOn(modelCall, 'generateModelWithRetry')
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
      .spyOn(modelCall, 'generateModelWithRetry')
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
      .spyOn(modelCall, 'generateModelWithRetry')
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

  test('keeps history media as markers without attaching old images', async () => {
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
    jest
      .spyOn(common, 'getRecentRawHistory')
      .mockResolvedValue([historyMessage])
    const modelSpy = jest
      .spyOn(modelCall, 'generateModelWithRetry')
      .mockResolvedValue(createModelResult({ text: 'answer' }))

    await runAgenticLoop(
      createMessage('ordinary request without image keywords'),
      createApi(),
      undefined,
      undefined,
      { bypassReplyGate: true },
    )

    const modelInput = modelSpy.mock.calls[0]?.[0]
    expect(modelInput?.system).toContain('message_id=8')
    expect(modelInput?.system).toContain('[media: photo]')
    expect(JSON.stringify(modelInput?.messages)).not.toContain('"type":"image"')
  })

  test('sends a user-facing failure and always stops indicators', async () => {
    const error = Object.assign(new Error('model overloaded'), { status: 503 })
    jest.spyOn(modelCall, 'generateModelWithRetry').mockRejectedValue(error)
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
      .spyOn(modelCall, 'generateModelWithRetry')
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
    const modelSpy = jest.spyOn(modelCall, 'generateModelWithRetry')

    await runAgenticLoop({ message_id: 10 } as Message, createApi())

    expect(modelSpy).not.toHaveBeenCalled()
    expect(delivery.sendResponses).not.toHaveBeenCalled()
  })
})
