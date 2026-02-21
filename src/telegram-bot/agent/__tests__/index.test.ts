import type { Message } from 'telegram-typings'

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
})
