import { getAgentWorkerIdempotencyKey } from '../idempotency'

describe('agent worker idempotency', () => {
  test('uses the shared worker key namespace', () => {
    expect(getAgentWorkerIdempotencyKey(-100, 42)).toBe(
      'agent-worker:message:-100:42',
    )
  })
})
