import {
  acquireAgentWorkerLease,
  getAgentWorkerIdempotencyKey,
  isLocalAgentWorkerTestMessage,
  LOCAL_TEST_MESSAGE_ID,
} from '../idempotency'

const originalIsOffline = process.env.IS_OFFLINE

afterEach(() => {
  if (originalIsOffline === undefined) {
    delete process.env.IS_OFFLINE
  } else {
    process.env.IS_OFFLINE = originalIsOffline
  }
})

describe('agent worker idempotency', () => {
  test('uses the shared worker key namespace', () => {
    expect(getAgentWorkerIdempotencyKey(-100, 42)).toBe(
      'agent-worker:message:-100:42',
    )
  })

  test('does not cache the reserved local test message', async () => {
    process.env.IS_OFFLINE = 'true'

    const lease = await acquireAgentWorkerLease(
      -100,
      LOCAL_TEST_MESSAGE_ID,
      'request-id',
    )

    expect(await lease?.renew()).toBe(true)
    expect(await lease?.complete()).toBe(true)
    expect(await lease?.release()).toBe(true)
  })

  test('only bypasses the reserved id in serverless offline', () => {
    process.env.IS_OFFLINE = 'false'
    expect(isLocalAgentWorkerTestMessage(LOCAL_TEST_MESSAGE_ID)).toBe(false)

    process.env.IS_OFFLINE = 'true'
    expect(isLocalAgentWorkerTestMessage(LOCAL_TEST_MESSAGE_ID + 1)).toBe(false)

    expect(isLocalAgentWorkerTestMessage(LOCAL_TEST_MESSAGE_ID)).toBe(true)
  })
})
