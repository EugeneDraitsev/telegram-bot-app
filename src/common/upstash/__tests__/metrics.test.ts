import * as client from '../client'
import {
  getFormattedMetrics,
  getMetrics,
  recordMetric,
  timedCall,
} from '../metrics'

const mockZadd = jest.fn()
const mockZrange = jest.fn()
const mockZremrangebyscore = jest.fn()

jest.spyOn(client, 'getRedisClient').mockReturnValue({
  zadd: mockZadd,
  zrange: mockZrange,
  zremrangebyscore: mockZremrangebyscore,
} as unknown as ReturnType<typeof client.getRedisClient>)

beforeEach(() => {
  mockZadd.mockReset()
  mockZrange.mockReset()
  mockZremrangebyscore.mockReset()
})

describe('recordMetric', () => {
  test('should store metric in Redis sorted set', async () => {
    mockZadd.mockResolvedValue(1)
    mockZremrangebyscore.mockResolvedValue(0)

    await recordMetric({
      type: 'model_call',
      source: 'agentic',
      name: 'routing',
      model: 'gemini-2.5-flash',
      chatId: 123,
      durationMs: 1500,
      success: true,
      timestamp: Date.now(),
    })

    expect(mockZadd).toHaveBeenCalledWith('agent:metrics', {
      score: expect.any(Number),
      member: expect.any(String),
    })
    expect(mockZremrangebyscore).toHaveBeenCalled()
  })

  test('should silently ignore Redis errors', async () => {
    mockZadd.mockRejectedValue(new Error('redis down'))
    await expect(
      recordMetric({
        type: 'tool_call',
        source: 'agentic',
        name: 'web_search',
        chatId: 123,
        durationMs: 500,
        success: false,
        timestamp: Date.now(),
      }),
    ).resolves.toBeUndefined()
  })
})

describe('timedCall', () => {
  test('should record success metric', async () => {
    mockZadd.mockResolvedValue(1)
    mockZremrangebyscore.mockResolvedValue(0)

    const result = await timedCall(
      { type: 'model_call', source: 'command', name: '/q', chatId: 1 },
      async () => 'hello',
    )

    expect(result).toBe('hello')
    expect(mockZadd).toHaveBeenCalled()
    const stored = JSON.parse(
      (mockZadd.mock.calls[0][1] as { member: string }).member,
    )
    expect(stored.success).toBe(true)
    expect(stored.name).toBe('/q')
  })

  test('should record failure metric and re-throw', async () => {
    mockZadd.mockResolvedValue(1)
    mockZremrangebyscore.mockResolvedValue(0)

    await expect(
      timedCall(
        { type: 'model_call', source: 'command', name: '/q', chatId: 1 },
        async () => {
          throw new Error('boom')
        },
      ),
    ).rejects.toThrow('boom')

    const stored = JSON.parse(
      (mockZadd.mock.calls[0][1] as { member: string }).member,
    )
    expect(stored.success).toBe(false)
  })
})

describe('getMetrics', () => {
  test('should parse string entries', async () => {
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
  })

  test('should handle auto-deserialized objects from Upstash', async () => {
    mockZrange.mockResolvedValue([
      {
        type: 'tool_call',
        source: 'agentic',
        name: 'web_search',
        chatId: 1,
        durationMs: 3000,
        success: true,
        timestamp: Date.now(),
      },
    ])

    const entries = await getMetrics(0)
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('web_search')
  })

  test('should filter out invalid entries', async () => {
    mockZrange.mockResolvedValue([
      'invalid json{',
      null,
      { name: 'no_duration' },
    ])

    const entries = await getMetrics(0)
    expect(entries).toHaveLength(0)
  })
})

describe('getFormattedMetrics', () => {
  test('should return empty message when no metrics', async () => {
    mockZrange.mockResolvedValue([])
    const result = await getFormattedMetrics(24)
    expect(result).toContain('No metrics')
  })

  test('should format metrics with sections', async () => {
    const now = Date.now()
    mockZrange.mockResolvedValue([
      {
        type: 'model_call',
        source: 'agentic',
        name: 'routing',
        model: 'gemini-2.5-flash',
        chatId: 1,
        durationMs: 2000,
        success: true,
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
        timestamp: now,
      },
    ])

    const result = await getFormattedMetrics(24)
    expect(result).toContain('Metrics')
    expect(result).toContain('50%')
    expect(result).toContain('Agentic')
    expect(result).toContain('routing')
    expect(result).toContain('web_search')
    expect(result).toContain('Models')
    expect(result).toContain('2.5-flash')
  })

  test('should clamp hoursBack to safe range', async () => {
    mockZrange.mockResolvedValue([])
    await getFormattedMetrics(-5)
    await getFormattedMetrics(99999)
    await getFormattedMetrics(0)
    // Should not throw
  })
})

describe('no redis client', () => {
  beforeEach(() => {
    jest.spyOn(client, 'getRedisClient').mockReturnValue(null)
  })

  test('recordMetric silently returns', async () => {
    await expect(
      recordMetric({
        type: 'model_call',
        source: 'agentic',
        name: 'test',
        chatId: 1,
        durationMs: 100,
        success: true,
        timestamp: Date.now(),
      }),
    ).resolves.toBeUndefined()
  })

  test('getMetrics returns empty array', async () => {
    expect(await getMetrics(0)).toEqual([])
  })
})
