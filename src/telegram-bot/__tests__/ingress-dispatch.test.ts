import {
  respondToWebhookDispatch,
  waitForIngressDispatch,
} from '../ingress-dispatch'

describe('ingress dispatch reliability', () => {
  test('returns 503 when dispatch fails so Telegram retries', async () => {
    const error = new Error('dispatch failed')
    const onError = jest.fn()

    await expect(
      respondToWebhookDispatch(() => Promise.reject(error), onError),
    ).resolves.toEqual({ statusCode: 503, body: '' })
    expect(onError).toHaveBeenCalledWith(error)
  })

  test('waits for every dispatch ACK before reporting a failure', async () => {
    const error = new Error('activity invoke failed')
    let resolveReply: (() => void) | undefined
    const replyDispatch = new Promise<void>((resolve) => {
      resolveReply = resolve
    })
    let settled = false

    const dispatch = waitForIngressDispatch([
      Promise.reject(error),
      replyDispatch,
    ]).finally(() => {
      settled = true
    })

    await Promise.resolve()
    expect(settled).toBe(false)

    resolveReply?.()
    await expect(dispatch).rejects.toThrow('Ingress dispatch failed')
  })
})
