import type { Redis } from '@upstash/redis'

import {
  acquirePaidMediaCooldown,
  getPaidMediaCooldownKey,
  PAID_MEDIA_COOLDOWN_SECONDS,
  setPaidMediaCooldownRedisClientForTests,
} from '../paid-media-cooldown'

const originalOffline = process.env.IS_OFFLINE

afterEach(() => {
  setPaidMediaCooldownRedisClientForTests(undefined)
  if (originalOffline === undefined) delete process.env.IS_OFFLINE
  else process.env.IS_OFFLINE = originalOffline
})

test('claims one Redis-backed cooldown window per user', async () => {
  delete process.env.IS_OFFLINE
  const set = jest.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(null)
  setPaidMediaCooldownRedisClientForTests({ set } as unknown as Redis)

  await expect(acquirePaidMediaCooldown(42)).resolves.toBe(true)
  await expect(acquirePaidMediaCooldown(42)).resolves.toBe(false)
  expect(set).toHaveBeenCalledWith(getPaidMediaCooldownKey(42), '1', {
    ex: PAID_MEDIA_COOLDOWN_SECONDS,
    nx: true,
  })
})

test('does not rate-limit serverless-offline development', async () => {
  process.env.IS_OFFLINE = 'true'
  const set = jest.fn()
  setPaidMediaCooldownRedisClientForTests({ set } as unknown as Redis)

  await expect(acquirePaidMediaCooldown(42)).resolves.toBe(true)
  expect(set).not.toHaveBeenCalled()
})
