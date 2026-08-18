import type { Redis } from '@upstash/redis'

const mockZadd = jest.fn()
const mockZrange = jest.fn()
const mockZremrangebyscore = jest.fn()

const {
  buildMetricsReport,
  clearMetricsMaintenanceCache,
  getMetrics,
  recordMetric,
  setMetricsRedisClientForTests,
  timedCall,
} = require('../metrics') as typeof import('../metrics')

function mockRedisClient(): Redis {
  return {
    zadd: mockZadd,
    zrange: mockZrange,
    zremrangebyscore: mockZremrangebyscore,
  } as unknown as Redis
}

beforeEach(() => {
  clearMetricsMaintenanceCache()
  mockZadd.mockReset()
  mockZrange.mockReset()
  mockZremrangebyscore.mockReset().mockResolvedValue(0)
  setMetricsRedisClientForTests(mockRedisClient())
})

describe('recordMetric', () => {
  test('writes every metric but trims only once per maintenance window', async () => {
    const dateNowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(1_800_000_000_000)
    mockZadd.mockResolvedValue(1)

    const entry = {
      type: 'model_call',
      source: 'agentic',
      name: 'reply_gate',
      chatId: 123,
      durationMs: 250,
      success: true,
      timestamp: 1_800_000_000_000,
    } as const

    await recordMetric(entry)
    await recordMetric(entry)
    dateNowSpy.mockRestore()

    expect(mockZadd).toHaveBeenCalledTimes(2)
    expect(mockZremrangebyscore).toHaveBeenCalledTimes(1)
  })

  test('keeps Redis errors non-fatal', async () => {
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
    expect(mockZremrangebyscore).toHaveBeenCalledTimes(1)
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

describe('buildMetricsReport', () => {
  test('separates models, tools, and command attribution', () => {
    const now = Date.now()
    const report = buildMetricsReport(
      [
        {
          type: 'model_call',
          source: 'command',
          command: 'e',
          name: 'image_generation',
          model: 'openai/gpt-image-2',
          chatId: 1,
          durationMs: 9000,
          success: true,
          status: 'success',
          timestamp: now,
        },
        {
          type: 'tool_call',
          source: 'command',
          command: 'e',
          name: 'generate_or_edit_image',
          model: 'this-must-not-appear-as-a-model',
          chatId: 1,
          durationMs: 9100,
          success: true,
          status: 'success',
          timestamp: now,
        },
      ],
      24,
      now,
    )

    expect(report.modelCalls).toBe(1)
    expect(report.toolCalls).toBe(1)
    expect(report.commandCalls).toBe(2)
    expect(report.commands[0]?.label).toBe('/e')
    expect(report.models.map(({ label }) => label)).toEqual([
      'openai/gpt-image-2',
    ])
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
