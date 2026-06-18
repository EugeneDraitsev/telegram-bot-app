import type { Message } from 'grammy/types'

import * as common from '@tg-bot/common'
import { handleMessageWithAgent } from '..'

describe('handleMessageWithAgent', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('returns early when message has no chat id', async () => {
    const invokeSpy = jest.spyOn(common, 'invokeAgentLambda')
    const message = {} as Message

    await handleMessageWithAgent(message)

    expect(invokeSpy).not.toHaveBeenCalled()
  })

  test('waits for invoke ACK before resolving', async () => {
    let resolveInvoke: (() => void) | undefined
    type InvokeAck = Awaited<ReturnType<typeof common.invokeAgentLambda>>
    const invokePromise: Promise<InvokeAck> = new Promise((resolve) => {
      resolveInvoke = () => resolve({} as InvokeAck)
    })

    const invokeSpy = jest
      .spyOn(common, 'invokeAgentLambda')
      .mockReturnValue(invokePromise)

    const message = { chat: { id: 123 } } as Message

    let isResolved = false
    const handlerPromise = handleMessageWithAgent(message).then(() => {
      isResolved = true
    })

    await Promise.resolve()

    expect(invokeSpy).toHaveBeenCalledTimes(1)
    expect(isResolved).toBe(false)

    resolveInvoke?.()
    await handlerPromise

    expect(isResolved).toBe(true)
  })

  test('strips command text and bypasses reply gate for explicit command invokes', async () => {
    const invokeSpy = jest
      .spyOn(common, 'invokeAgentLambda')
      .mockResolvedValue(
        {} as Awaited<ReturnType<typeof common.invokeAgentLambda>>,
      )

    const message = {
      message_id: 10,
      chat: { id: 123 },
      text: '/q explain this',
    } as Message

    await handleMessageWithAgent(message, {
      bypassReplyGate: true,
      stripCommand: true,
    })

    expect(invokeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        bypassReplyGate: true,
        message: expect.objectContaining({
          message_id: 10,
          text: 'explain this',
        }),
      }),
    )
  })
})
