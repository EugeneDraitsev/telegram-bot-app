import type { Message } from 'grammy/types'

import * as common from '@tg-bot/common'
import { handleMessageWithAgent } from '..'

describe('handleMessageWithAgent', () => {
  beforeEach(() => {
    jest.spyOn(common, 'isAgenticChatEnabled').mockResolvedValue(true)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('returns early when message has no chat id', async () => {
    const enqueueSpy = jest.spyOn(common, 'enqueueAgentWorker')
    const message = {} as Message

    await handleMessageWithAgent(message)

    expect(enqueueSpy).not.toHaveBeenCalled()
  })

  test('does not enqueue a disabled chat', async () => {
    jest.spyOn(common, 'isAgenticChatEnabled').mockResolvedValue(false)
    const enqueueSpy = jest.spyOn(common, 'enqueueAgentWorker')

    await handleMessageWithAgent({ chat: { id: 123 } } as Message)

    expect(enqueueSpy).not.toHaveBeenCalled()
  })

  test('queues an enabled chat candidate', async () => {
    const enqueueSpy = jest
      .spyOn(common, 'enqueueAgentWorker')
      .mockResolvedValue(
        {} as Awaited<ReturnType<typeof common.enqueueAgentWorker>>,
      )

    await handleMessageWithAgent({ chat: { id: 123 } } as Message)

    expect(enqueueSpy).toHaveBeenCalledTimes(1)
  })

  test('waits for enqueue ACK before resolving', async () => {
    let resolveEnqueue: (() => void) | undefined
    type EnqueueAck = Awaited<ReturnType<typeof common.enqueueAgentWorker>>
    const enqueuePromise: Promise<EnqueueAck> = new Promise((resolve) => {
      resolveEnqueue = () => resolve({} as EnqueueAck)
    })

    const enqueueSpy = jest
      .spyOn(common, 'enqueueAgentWorker')
      .mockReturnValue(enqueuePromise)

    const message = { chat: { id: 123 } } as Message

    let isResolved = false
    const handlerPromise = handleMessageWithAgent(message).then(() => {
      isResolved = true
    })

    await Promise.resolve()

    expect(enqueueSpy).toHaveBeenCalledTimes(1)
    expect(isResolved).toBe(false)

    resolveEnqueue?.()
    await handlerPromise

    expect(isResolved).toBe(true)
  })

  test('strips command text and bypasses reply gate for explicit command jobs', async () => {
    const enqueueSpy = jest
      .spyOn(common, 'enqueueAgentWorker')
      .mockResolvedValue(
        {} as Awaited<ReturnType<typeof common.enqueueAgentWorker>>,
      )

    const message = {
      message_id: 10,
      chat: { id: 123 },
      text: '/q explain this',
    } as Message

    await handleMessageWithAgent(message, {
      bypassReplyGate: true,
      stripCommand: true,
      commandName: 'q',
    })

    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        bypassReplyGate: true,
        commandName: 'q',
        message: expect.objectContaining({
          message_id: 10,
          text: 'explain this',
        }),
      }),
    )
  })

  test('propagates enqueue failures so Telegram can retry the update', async () => {
    const error = new Error('SQS enqueue failed')
    jest.spyOn(common, 'enqueueAgentWorker').mockRejectedValue(error)

    await expect(
      handleMessageWithAgent({ chat: { id: 123 } } as Message),
    ).rejects.toBe(error)
  })
})
