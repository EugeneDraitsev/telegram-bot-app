interface CacheEntry<T> {
  value: T
  expiresAt: number
}

/** Per-Lambda-instance TTL cache for slow-changing values. */
export class TtlCache<K, V> {
  private readonly entries = new Map<K, CacheEntry<V>>()

  constructor(private readonly ttlMs: number) {}

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
    this.entries.set(key, { value, expiresAt: now + this.ttlMs })
  }

  delete(key: K): void {
    this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
  }
}
