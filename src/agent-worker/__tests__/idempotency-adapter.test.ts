import { acquireAgentWorkerLease } from '../idempotency'

const originalIsOffline = process.env.IS_OFFLINE

afterEach(() => {
  if (originalIsOffline === undefined) {
    delete process.env.IS_OFFLINE
  } else {
    process.env.IS_OFFLINE = originalIsOffline
  }
})

describe('agent worker idempotency', () => {
  test.each([1, 42, 900_001])(
    'does not cache local test message %i',
    async (messageId) => {
      process.env.IS_OFFLINE = 'true'

      const lease = await acquireAgentWorkerLease(-100, messageId, 'request-id')

      expect(await lease?.complete()).toBe(true)
      expect(await lease?.release()).toBe(true)
    },
  )
})
