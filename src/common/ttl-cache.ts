interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export const DEFAULT_TTL_CACHE_MAX_ENTRIES = 1_000

/** Bounded per-Lambda-instance TTL cache for slow-changing values. */
export class TtlCache<K, V> {
  private readonly entries = new Map<K, CacheEntry<V>>()

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = DEFAULT_TTL_CACHE_MAX_ENTRIES,
  ) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError('ttlMs must be a positive finite number')
    }
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new RangeError('maxEntries must be a positive integer')
    }
  }

  get(key: K, now = Date.now()): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) {
      return undefined
    }

    if (entry.expiresAt <= now) {
      this.entries.delete(key)
      return undefined
    }

    return entry.value
  }

  set(key: K, value: V, now = Date.now()): void {
    // Refresh insertion order so frequently updated keys are evicted last.
    this.entries.delete(key)

    if (this.entries.size >= this.maxEntries) {
      this.deleteExpired(now)
    }

    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next()
      if (oldest.done) {
        break
      }
      this.entries.delete(oldest.value)
    }

    this.entries.set(key, { value, expiresAt: now + this.ttlMs })
  }

  delete(key: K): void {
    this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
  }

  private deleteExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key)
      }
    }
  }
}
