const mockZadd = jest.fn()
const mockZrange = jest.fn()
const mockZremrangebyscore = jest.fn()

const {
  getFormattedMetrics,
  getMetrics,
  recordMetric,
  setMetricsRedisClientForTests,
  timedCall,
} = require('../metrics') as typeof import('../metrics')

function mockRedisClient() {
  return {
    zadd: mockZadd,
    zrange: mockZrange,
    zremrangebyscore: mockZremrangebyscore,
  }
}

beforeEach(() => {
  mockZadd.mockReset()
  mockZrange.mockReset()
  mockZremrangebyscore.mockReset()
  setMetricsRedisClientForTests(mockRedisClient())
})

describe('recordMetric', () => {
  test('silently ignores Redis errors', async () => {
    mockZadd.mockRejectedValue(new Error('redis down'))

    await recordMetric({
      type: 'tool_call',
      source: 'agentic',
      name: 'web_search',
      chatId: 123,
      durationMs: 500,
      success: false,
      timestamp: Date.now(),
    })
  })
})

describe('timedCall', () => {
  test('returns successful result', async () => {
    const result = await timedCall(
      { type: 'model_call', source: 'command', name: '/q', chatId: 1 },
      async () => 'hello',
    )

    expect(result).toBe('hello')
  })

  test('returns classified result failures without throwing', async () => {
    const result = await timedCall(
      {
        type: 'model_call',
        source: 'command',
        name: '/q',
        chatId: 1,
        classifyResult: (value) =>
          value === 'Something went wrong' ? 'error' : 'success',
      },
      async () => 'Something went wrong',
    )

    expect(result).toBe('Something went wrong')
  })

  test('re-throws timeout errors', async () => {
    await expect(
      timedCall(
        { type: 'model_call', source: 'command', name: '/q', chatId: 1 },
        async () => {
          const error = new Error('request timed out')
          error.name = 'TimeoutError'
          throw error
        },
      ),
    ).rejects.toThrow('request timed out')
  })
})

describe('getMetrics', () => {
  test('parses string entries and backfills status', async () => {
    mockZrange.mockResolvedValue([
      JSON.stringify({
        type: 'model_call',
        source: 'agentic',
        name: 'routing',
        chatId: 1,
        durationMs: 2000,
        success: true,
        timestamp: Date.now(),
      }),
    ])

    const entries = await getMetrics(0)

    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('routing')
    expect(entries[0].status).toBe('success')
  })

  test('handles auto-deserialized objects from Upstash', async () => {
    mockZrange.mockResolvedValue([
      {
        type: 'tool_call',
        source: 'agentic',
        name: 'web_search',
        chatId: 1,
        durationMs: 3000,
        success: false,
        status: 'timeout',
        timestamp: Date.now(),
      },
    ])

    const entries = await getMetrics(0)

    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('web_search')
    expect(entries[0].status).toBe('timeout')
  })

  test('filters out invalid entries', async () => {
    mockZrange.mockResolvedValue([
      'invalid json{',
      null,
      { name: 'no_duration' },
    ])

    expect(await getMetrics(0)).toHaveLength(0)
  })

  test('returns empty array on Redis errors', async () => {
    mockZrange.mockRejectedValue(new Error('redis down'))
    expect(await getMetrics(0)).toEqual([])
  })
})

describe('getFormattedMetrics', () => {
  test('returns empty message when no metrics', async () => {
    mockZrange.mockResolvedValue([])
    const result = await getFormattedMetrics(24)
    expect(result).toContain('No metrics')
  })

  test('formats timeout, error, and fallback breakdowns', async () => {
    const now = Date.now()
    mockZrange.mockResolvedValue([
      {
        type: 'model_call',
        source: 'agentic',
        name: 'routing',
        model: 'gemini-2.5-flash',
        fallbackFrom: 'gemini-3.1-flash-lite-preview',
        chatId: 1,
        durationMs: 4000,
        success: true,
        status: 'success',
        timestamp: now,
      },
      {
        type: 'tool_call',
        source: 'agentic',
        name: 'web_search',
        model: 'gemini-2.5-flash-lite',
        chatId: 1,
        durationMs: 3000,
        success: false,
        status: 'timeout',
        timestamp: now,
      },
      {
        type: 'model_call',
        source: 'command',
        name: '/q',
        model: 'gemini-3-flash-preview',
        chatId: 1,
        durationMs: 1200,
        success: false,
        status: 'error',
        timestamp: now,
      },
    ])

    const result = await getFormattedMetrics(24)

    expect(result).toContain('Metrics')
    expect(result).toContain('33% ok')
    expect(result).toContain('timeout')
    expect(result).toContain('fallback')
    expect(result).toContain('routing')
    expect(result).toContain('web_search')
    expect(result).toContain('Models')
    expect(result).toContain('2.5-flash <= 3.1-flash-lite')
  })

  test('clamps hoursBack to safe range', async () => {
    mockZrange.mockResolvedValue([])
    await getFormattedMetrics(-5)
    await getFormattedMetrics(99999)
    await getFormattedMetrics(0)
  })
})

describe('no Redis client', () => {
  beforeEach(() => {
    setMetricsRedisClientForTests(null)
  })

  test('recordMetric silently returns', async () => {
    await recordMetric({
      type: 'model_call',
      source: 'agentic',
      name: 'test',
      chatId: 1,
      durationMs: 100,
      success: true,
      timestamp: Date.now(),
    })
  })

  test('getMetrics returns empty array', async () => {
    expect(await getMetrics(0)).toEqual([])
  })
})
