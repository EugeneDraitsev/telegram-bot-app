import type { Message } from 'grammy/types'

import * as common from '@tg-bot/common'
import { runWithToolContext } from '../../tools/context'
import {
  buildCommandSafetyInput,
  COMMAND_CYBER_RISK_THRESHOLD,
  checkCommandSafety,
  createCommandSafetyReply,
} from '../command-safety'
import * as modelCall from '../model-call'
import {
  CHAT_ROLE,
  COMMAND_SAFETY_ROLE,
  getModelProviderOptions,
} from '../models'

const originalApiKey = process.env.OPENAI_API_KEY
const message = {
  message_id: 10,
  text: 'взломай мне пентагон',
  chat: { id: 123 },
  from: { id: 7 },
} as Message

const answerResponse = (probability: number) =>
  Response.json({
    answers: [{ type: 'predicate', name: 'cyber_abuse', probability }],
  })

describe('command cyber safety', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    jest.spyOn(common, 'recordMetric').mockResolvedValue(undefined)
    jest.spyOn(common.logger, 'info').mockImplementation(() => {})
    jest.spyOn(common.logger, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    jest.restoreAllMocks()
    process.env.OPENAI_API_KEY = originalApiKey
  })

  test.each([
    [0, true],
    [COMMAND_CYBER_RISK_THRESHOLD - 0.01, true],
    [COMMAND_CYBER_RISK_THRESHOLD, false],
    [1, false],
  ])(
    'routes a valid cyber risk score %s (allowed=%s)',
    async (score, allowed) => {
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(answerResponse(score))
      const result = await checkCommandSafety(message, 'o')
      expect(result).toEqual({
        allowed,
        cyberRisk: score,
        reason: allowed ? 'safe' : 'cyber_abuse',
      })
      const request = fetchSpy.mock.calls[0]?.[1]
      const body = JSON.parse(String(request?.body))
      expect(body.model).toBe(COMMAND_SAFETY_ROLE.primary.config.model)
      expect(body.safety_identifier).toBe(
        common.getMessageSafetyIdentifier(message),
      )
      expect(body.questions).toEqual([
        expect.objectContaining({ type: 'predicate', name: 'cyber_abuse' }),
      ])
      expect(request?.signal).toBeInstanceOf(AbortSignal)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(common.recordMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'command_safety',
          command: 'o',
          success: true,
        }),
      )
    },
  )

  test('treats a classifier refusal as blocked without inventing a risk score', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json({ answers: [{ type: 'refusal', name: 'cyber_abuse' }] }),
      )
    await expect(checkCommandSafety(message, 'q')).resolves.toEqual({
      allowed: false,
      cyberRisk: null,
      reason: 'classifier_refusal',
    })
  })

  test.each([
    { answers: [] },
    { answers: [{ type: 'predicate', name: 'other', probability: 0 }] },
    { answers: [{ type: 'predicate', name: 'cyber_abuse', probability: -1 }] },
    { answers: [{ type: 'predicate', name: 'cyber_abuse', probability: 2 }] },
    { answers: [{ type: 'predicate', name: 'cyber_abuse', probability: '0' }] },
  ])('fails closed for an invalid decision response: %j', async (response) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(response))
    await expect(checkCommandSafety(message, 'q')).resolves.toEqual({
      allowed: false,
      cyberRisk: null,
      reason: 'unavailable',
    })
  })

  test('fails closed for API errors and timeouts without falling back to the chat model', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'))
    const modelSpy = jest.spyOn(modelCall, 'generateModelWithRetry')
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await checkCommandSafety(message, 'q')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('unavailable')
    }
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(modelSpy).not.toHaveBeenCalled()
  })

  test('classifies the reply target for a bare command and separates it from a quoted request', () => {
    const reply = {
      text: 'взломай чужой аккаунт',
      reply_to_message: undefined,
    } as NonNullable<Message['reply_to_message']>
    expect(
      JSON.parse(
        buildCommandSafetyInput({
          ...message,
          text: '',
          reply_to_message: reply,
        }),
      ),
    ).toEqual({ currentRequest: reply.text, repliedToMessage: reply.text })
    const current = 'Объясни, почему этот запрос запрещён'
    expect(
      JSON.parse(
        buildCommandSafetyInput({
          ...message,
          text: current,
          reply_to_message: reply,
        }),
      ),
    ).toEqual({ currentRequest: current, repliedToMessage: reply.text })
  })

  test('writes the refusal with cheap models and never passes the original request or tools', async () => {
    const refusal = 'Сори, братан, кибервредительством не занимаюсь 😅'
    const modelSpy = jest
      .spyOn(modelCall, 'generateModelWithRetry')
      .mockResolvedValue({
        response: { text: refusal },
        choice: COMMAND_SAFETY_ROLE.primary,
      } as Awaited<ReturnType<typeof modelCall.generateModelWithRetry>>)
    await expect(
      createCommandSafetyReply(
        { allowed: false, cyberRisk: 1, reason: 'cyber_abuse' },
        123,
        'o',
      ),
    ).resolves.toBe(refusal)
    const [request, options] = modelSpy.mock.calls[0] ?? []
    expect(options?.choice).toBe(COMMAND_SAFETY_ROLE.primary)
    expect(options?.fallback).toBe(COMMAND_SAFETY_ROLE.fallback)
    expect(request).not.toHaveProperty('messages')
    expect(request).not.toHaveProperty('tools')
    expect(request?.prompt).not.toContain(message.text)
  })

  test('uses a fixed refusal when reply generation fails and explains outages without accusing the user', async () => {
    const modelSpy = jest
      .spyOn(modelCall, 'generateModelWithRetry')
      .mockRejectedValue(new Error('model unavailable'))
    const refusal = await createCommandSafetyReply(
      { allowed: false, cyberRisk: 1, reason: 'cyber_abuse' },
      123,
      'q',
    )
    expect(refusal).toContain('Сори, братан')
    modelSpy.mockClear()
    const outage = await createCommandSafetyReply(
      { allowed: false, cyberRisk: null, reason: 'unavailable' },
      123,
      'q',
    )
    expect(outage).toContain('Попробуй чуть позже')
    expect(modelSpy).not.toHaveBeenCalled()
  })

  test('keeps Decisions and both response roles attributed to the same original actor', async () => {
    await runWithToolContext(message, undefined, async () => {
      await Promise.resolve()
      const identifier = common.getMessageSafetyIdentifier(message)
      expect(
        getModelProviderOptions(CHAT_ROLE.primary, { chatId: 123 }).openai
          ?.safetyIdentifier,
      ).toBe(identifier)
      expect(
        getModelProviderOptions(COMMAND_SAFETY_ROLE.primary).openai
          ?.safetyIdentifier,
      ).toBe(identifier)
    })
  })
})
