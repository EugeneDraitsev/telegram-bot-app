import { TtlCache } from './ttl-cache'

describe('TtlCache', () => {
  test('returns a value only before its TTL expires', () => {
    const cache = new TtlCache<string, string>(100)

    cache.set('chat', 'value', 1_000)

    expect(cache.get('chat', 1_099)).toBe('value')
    expect(cache.get('chat', 1_100)).toBeUndefined()
  })

  test('evicts the oldest entry when the configured bound is reached', () => {
    const cache = new TtlCache<string, string>(1_000, 2)

    cache.set('first', 'one', 0)
    cache.set('second', 'two', 1)
    cache.set('third', 'three', 2)

    expect(cache.get('first', 2)).toBeUndefined()
    expect(cache.get('second', 2)).toBe('two')
    expect(cache.get('third', 2)).toBe('three')
  })

  test('drops expired entries before evicting live ones', () => {
    const cache = new TtlCache<string, string>(100, 2)

    cache.set('expired', 'old', 0)
    cache.set('live', 'current', 100)
    cache.set('new', 'latest', 101)

    expect(cache.get('expired', 101)).toBeUndefined()
    expect(cache.get('live', 101)).toBe('current')
    expect(cache.get('new', 101)).toBe('latest')
  })

  test('rejects invalid bounds', () => {
    expect(() => new TtlCache(0)).toThrow('ttlMs')
    expect(() => new TtlCache(1_000, 0)).toThrow('maxEntries')
  })
})
