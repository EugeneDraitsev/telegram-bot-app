import { BotError, type Context } from 'grammy'

import { serializeErrorForLog } from './logger'

describe('logger', () => {
  test('redacts large AI SDK request payloads from errors', () => {
    const error = Object.assign(new Error('model overloaded'), {
      status: 503,
      requestBodyValues: {
        contents: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: 'x'.repeat(5_000),
            },
          },
        ],
      },
      responseBody: 'y'.repeat(1_500),
    })

    const serialized = serializeErrorForLog(error) as Record<string, unknown>
    const serializedJson = JSON.stringify(serialized)

    expect(serialized.message).toBe('model overloaded')
    expect(serialized.status).toBe(503)
    expect(serialized.requestBodyValues).toBe('[redacted]')
    expect(serialized.responseBody).toContain('[truncated 500 chars]')
    expect(serializedJson).not.toContain('x'.repeat(100))
  })

  test('drops the grammY context, which holds the bot token', () => {
    const ctx = {
      api: { token: '123:SECRET-BOT-TOKEN' },
      update: { message: { text: 'private chat text' } },
    } as unknown as Context
    const error = new BotError(new Error('enqueue timed out'), ctx)

    const serialized = serializeErrorForLog(error) as Record<string, unknown>
    const serializedJson = JSON.stringify(serialized)

    expect(serialized.message).toContain('enqueue timed out')
    expect(serialized.ctx).toBe('[redacted]')
    expect(serializedJson).not.toContain('SECRET-BOT-TOKEN')
    expect(serializedJson).not.toContain('private chat text')
  })
})
