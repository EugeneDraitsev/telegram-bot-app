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
})
