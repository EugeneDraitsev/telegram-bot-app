import { shouldSkipStatsBroadcast } from '../chat-events'

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
