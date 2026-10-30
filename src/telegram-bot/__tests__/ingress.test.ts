import { Bot } from 'grammy/web'
import type { APIGatewayProxyEvent, Context } from 'aws-lambda'

import * as common from '@tg-bot/common'

let handler: typeof import('../index').default
const event = {
  body: '{}',
  headers: { 'x-telegram-bot-api-secret-token': 'secret' },
} as unknown as APIGatewayProxyEvent
const context = { awsRequestId: 'request-1' } as Context
const originalSecret = process.env.TELEGRAM_WEBHOOK_SECRET

beforeAll(async () => {
  // The module builds its bot on import, and grammY rejects an empty token.
  process.env.TOKEN ||= 'test-token'
  // Bun exposes the TS default directly; NodeNext types add a CJS wrapper.
  handler = (await import('../index.js')).default as unknown as typeof handler
})

afterEach(() => {
  jest.restoreAllMocks()
  if (originalSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET
  else process.env.TELEGRAM_WEBHOOK_SECRET = originalSecret
})

test('bounds the cold-start getMe and answers 503 so Telegram retries', async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = 'secret'
  const loggerError = jest
    .spyOn(common.logger, 'error')
    .mockImplementation(() => {})
  const init = jest
    .spyOn(Bot.prototype, 'init')
    .mockRejectedValue(new Error('The operation timed out'))

  await expect(handler(event, context, () => {})).resolves.toEqual({
    statusCode: 503,
    body: '',
  })

  const signal = init.mock.calls[0]?.[0] as AbortSignal | undefined
  expect(signal).toBeInstanceOf(AbortSignal)
  expect(loggerError).toHaveBeenCalledWith(
    { error: expect.any(Error) },
    'Bot handler error',
  )
})
