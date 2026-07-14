import { getChatEventSortKey, shouldSkipStatsBroadcast } from '../chat-events'

describe('shouldSkipStatsBroadcast', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  test('skips websocket broadcast in offline mode by default', () => {
    process.env.IS_OFFLINE = 'true'
    delete process.env.ENABLE_LOCAL_WEBSOCKET_BROADCAST

    expect(shouldSkipStatsBroadcast()).toBe(true)
  })

  test('allows local websocket broadcast when explicitly enabled', () => {
    process.env.IS_OFFLINE = 'true'
    process.env.ENABLE_LOCAL_WEBSOCKET_BROADCAST = 'true'

    expect(shouldSkipStatsBroadcast()).toBe(false)
  })

  test('allows websocket broadcast outside offline mode', () => {
    process.env.IS_OFFLINE = 'false'

    expect(shouldSkipStatsBroadcast()).toBe(false)
  })
})

describe('getChatEventSortKey', () => {
  test('uses the message id to avoid same-second collisions', () => {
    const date = 1_750_000_000
    const first = getChatEventSortKey(date, 10)
    const second = getChatEventSortKey(date, 11)

    expect(first).not.toBe(second)
    expect(first).toBeGreaterThanOrEqual(date * 1000)
    expect(first).toBeLessThan(date * 1000 + 1000)
  })

  test('is deterministic for duplicate delivery of the same message', () => {
    expect(getChatEventSortKey(1_750_000_000, 42)).toBe(
      getChatEventSortKey(1_750_000_000, 42),
    )
  })

  test('preserves millisecond timestamps when no message id is available', () => {
    expect(getChatEventSortKey(1_750_000_000_123)).toBe(1_750_000_000_123)
  })
})
