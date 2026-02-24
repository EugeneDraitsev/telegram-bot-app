/**
 * Metrics collection — logs and stores timing data for model calls and tools.
 * Stores in Redis sorted set keyed by timestamp for time-series queries.
 */

import { getRedisClient } from './client'

const METRICS_KEY = 'agent:metrics'
/** Keep metrics for 30 days */
const METRICS_TTL_MS = 30 * 24 * 60 * 60 * 1000

interface MetricEntry {
  /** 'model_call' for AI model invocations, 'tool_call' for tool executions */
  type: 'model_call' | 'tool_call'
  /** 'agentic' for agent loop calls, 'command' for /q /o /ge /e etc. */
  source: 'agentic' | 'command'
  name: string
  model?: string
  chatId: number
  durationMs: number
  success: boolean
  timestamp: number
}

/** Record a metric entry — stores in Redis for graphing (fire-and-forget) */
export async function recordMetric(entry: MetricEntry): Promise<void> {
  try {
    const redis = getRedisClient()
    if (!redis) return

    const now = Date.now()
    await redis.zadd(METRICS_KEY, {
      score: now,
      member: JSON.stringify(entry),
    })

    // Trim old entries (older than TTL)
    await redis.zremrangebyscore(METRICS_KEY, 0, now - METRICS_TTL_MS)
  } catch {
    // Silently ignore Redis errors — metrics are best-effort
  }
}

/** Time an async operation and record metrics */
export async function timedCall<T>(
  opts: {
    type: MetricEntry['type']
    source: MetricEntry['source']
    name: string
    model?: string
    chatId: number
  },
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    void recordMetric({
      ...opts,
      durationMs: Date.now() - start,
      success: true,
      timestamp: Date.now(),
    })
    return result
  } catch (error) {
    void recordMetric({
      ...opts,
      durationMs: Date.now() - start,
      success: false,
      timestamp: Date.now(),
    })
    throw error
  }
}

// ── Query & Visualization ────────────────────────────────────

/** Retrieve metric entries from Redis within a time range */
export async function getMetrics(
  fromMs: number,
  toMs: number = Date.now(),
): Promise<MetricEntry[]> {
  const redis = getRedisClient()
  if (!redis) return []

  const raw = await redis.zrange(METRICS_KEY, fromMs, toMs, { byScore: true })
  return (raw as unknown[])
    .map((s) => {
      try {
        // Upstash may auto-deserialize JSON, so s might be string or object
        if (typeof s === 'string') return JSON.parse(s) as MetricEntry
        if (typeof s === 'object' && s !== null) return s as MetricEntry
        return null
      } catch {
        return null
      }
    })
    .filter(
      (e): e is MetricEntry => e !== null && typeof e.durationMs === 'number',
    )
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

function progressBar(ratio: number, len = 10): string {
  const filled = Math.round(ratio * len)
  return '█'.repeat(filled) + '░'.repeat(len - filled)
}

/** Format metrics into a Telegram HTML message (mobile-friendly) */
export async function getFormattedMetrics(hoursBack = 24): Promise<string> {
  const fromMs = Date.now() - hoursBack * 60 * 60 * 1000
  const entries = await getMetrics(fromMs)

  if (entries.length === 0) {
    return `📊 No metrics in the last ${hoursBack}h`
  }

  const total = entries.length
  const successes = entries.filter((e) => e.success).length
  const failures = total - successes
  const successRate = total > 0 ? successes / total : 0
  const agenticCount = entries.filter((e) => e.source === 'agentic').length
  const commandCount = entries.filter((e) => e.source === 'command').length

  const lines: string[] = []

  lines.push(`<b>📊 Metrics — ${hoursBack}h</b>`)
  lines.push(
    `${progressBar(successRate)} <b>${(successRate * 100).toFixed(0)}%</b> · ${total} calls`,
  )
  if (failures > 0) lines.push(`❌ ${failures} failed`)
  lines.push(`🤖 ${agenticCount}  ⚡ ${commandCount}`)

  // Render a group of metrics
  const renderGroup = (title: string, items: MetricEntry[]) => {
    if (items.length === 0) return

    const byName = new Map<string, MetricEntry[]>()
    for (const e of items) {
      if (!byName.has(e.name)) byName.set(e.name, [])
      byName.get(e.name)!.push(e)
    }

    lines.push('')
    lines.push(`<b>${title}</b>`)
    for (const [name, group] of [...byName.entries()].sort(
      (a, b) => b[1].length - a[1].length,
    )) {
      const d = group.map((e) => e.durationMs)
      const fails = group.filter((e) => !e.success).length
      const fail = fails > 0 ? ` ❌${fails}` : ''
      lines.push(
        `<code>${name}</code> ${group.length}× ~${fmtMs(median(d))}${fail}`,
      )
    }
  }

  renderGroup(
    '🤖 Agentic',
    entries.filter((e) => e.source === 'agentic'),
  )
  renderGroup(
    '⚡ Commands',
    entries.filter((e) => e.source === 'command'),
  )

  // Models
  const modelEntries = entries.filter((e) => e.model)
  if (modelEntries.length > 0) {
    const byModel = new Map<string, MetricEntry[]>()
    for (const e of modelEntries) {
      if (!byModel.has(e.model!)) byModel.set(e.model!, [])
      byModel.get(e.model!)!.push(e)
    }

    lines.push('')
    lines.push('<b>🧠 Models</b>')
    for (const [model, items] of [...byModel.entries()].sort(
      (a, b) => b[1].length - a[1].length,
    )) {
      const d = items.map((e) => e.durationMs)
      const short = model.replace('gemini-', '').replace('-preview', '')
      lines.push(`<code>${short}</code> ${items.length}× ~${fmtMs(median(d))}`)
    }
  }

  return lines.join('\n')
}
