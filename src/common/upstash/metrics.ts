/**
 * Metrics collection — logs and stores timing data for model calls and tools.
 * Stores in Redis sorted set keyed by timestamp for time-series queries.
 */

import * as client from './client'

const METRICS_KEY = 'agent:metrics'
/** Keep metrics for 30 days */
const METRICS_TTL_MS = 30 * 24 * 60 * 60 * 1000
let redisClientOverride: ReturnType<typeof client.getRedisClient> | undefined

export type MetricStatus = 'success' | 'error' | 'timeout'

export interface MetricEntry {
  /** 'model_call' for AI model invocations, 'tool_call' for tool executions */
  type: 'model_call' | 'tool_call'
  /** 'agentic' for agent loop calls, 'command' for /q /o /ge /e etc. */
  source: 'agentic' | 'command'
  name: string
  model?: string
  fallbackFrom?: string
  chatId: number
  durationMs: number
  success: boolean
  status?: MetricStatus
  timestamp: number
}

function normalizeMetricEntry(entry: MetricEntry): MetricEntry {
  const status = entry.status ?? (entry.success ? 'success' : 'error')
  return {
    ...entry,
    status,
    success: status === 'success',
  }
}

export function setMetricsRedisClientForTests(
  redis: ReturnType<typeof client.getRedisClient> | undefined,
): void {
  redisClientOverride = redis
}

function getMetricsRedisClient(): ReturnType<typeof client.getRedisClient> {
  if (redisClientOverride !== undefined) {
    return redisClientOverride
  }

  return client.getRedisClient()
}

export function getMetricStatusFromError(error: unknown): MetricStatus {
  if (!(error instanceof Error)) {
    return 'error'
  }

  const name = error.name.toLowerCase()
  const message = error.message.toLowerCase()

  if (
    name.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('timeout')
  ) {
    return 'timeout'
  }

  return 'error'
}

/** Record a metric entry — stores in Redis for graphing (fire-and-forget) */
export async function recordMetric(entry: MetricEntry): Promise<void> {
  try {
    const redis = getMetricsRedisClient()
    if (!redis) return

    const timestamp = Number.isFinite(entry.timestamp)
      ? entry.timestamp
      : Date.now()
    const metricEntry = normalizeMetricEntry({ ...entry, timestamp })

    await redis.zadd(METRICS_KEY, {
      score: timestamp,
      member: JSON.stringify(metricEntry),
    })

    // Trim old entries (older than TTL)
    await redis.zremrangebyscore(METRICS_KEY, 0, timestamp - METRICS_TTL_MS)
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
    classifyResult?: (result: T) => MetricStatus
  },
  fn: () => Promise<T>,
): Promise<T> {
  const { classifyResult, ...metricOpts } = opts
  const start = Date.now()

  try {
    const result = await fn()
    const end = Date.now()
    const status = classifyResult?.(result) ?? 'success'

    void recordMetric({
      ...metricOpts,
      durationMs: end - start,
      success: status === 'success',
      status,
      timestamp: end,
    })

    return result
  } catch (error) {
    const end = Date.now()
    const status = getMetricStatusFromError(error)

    void recordMetric({
      ...metricOpts,
      durationMs: end - start,
      success: false,
      status,
      timestamp: end,
    })

    throw error
  }
}

/** Retrieve metric entries from Redis within a time range */
export async function getMetrics(
  fromMs: number,
  toMs: number = Date.now(),
): Promise<MetricEntry[]> {
  try {
    const redis = getMetricsRedisClient()
    if (!redis) return []

    const raw = await redis.zrange(METRICS_KEY, fromMs, toMs, { byScore: true })
    return (raw as unknown[])
      .map((value) => {
        try {
          if (typeof value === 'string') {
            return normalizeMetricEntry(JSON.parse(value) as MetricEntry)
          }
          if (typeof value === 'object' && value !== null) {
            return normalizeMetricEntry(value as MetricEntry)
          }
          return null
        } catch {
          return null
        }
      })
      .filter(
        (entry): entry is MetricEntry =>
          entry !== null && typeof entry.durationMs === 'number',
      )
  } catch {
    return []
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

function progressBar(ratio: number, length = 15): string {
  const filled = Math.round(ratio * length)
  return '▰'.repeat(filled) + '▱'.repeat(length - filled)
}

function getOutcomeCounts(entries: MetricEntry[]) {
  const success = entries.filter((entry) => entry.status === 'success').length
  const timeout = entries.filter((entry) => entry.status === 'timeout').length
  const error = entries.filter((entry) => entry.status === 'error').length
  const fallback = entries.filter((entry) => entry.fallbackFrom).length

  return {
    success,
    timeout,
    error,
    fallback,
  }
}

function shortModelName(model: string): string {
  return model.replace(/^gemini-/, '').replace(/-preview$/, '')
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatOutcomeSummary(entries: MetricEntry[]): string {
  if (entries.length === 0) return ''

  const { success, timeout, error, fallback } = getOutcomeCounts(entries)
  const parts = [`${Math.round((success / entries.length) * 100)}% ok`]

  if (timeout > 0) parts.push(`${timeout} to`)
  if (error > 0) parts.push(`${error} err`)
  if (fallback > 0) parts.push(`${fallback} fb`)

  return ` (${parts.join(' · ')})`
}

/** Format metrics into a Telegram HTML message (mobile-friendly) */
export async function getFormattedMetrics(hoursBack = 24): Promise<string> {
  hoursBack = Math.max(1, Math.min(720, hoursBack || 24))
  const fromMs = Date.now() - hoursBack * 60 * 60 * 1000
  const entries = await getMetrics(fromMs)

  if (entries.length === 0) {
    return `📊 No metrics in the last ${hoursBack}h`
  }

  const total = entries.length
  const { success, timeout, error, fallback } = getOutcomeCounts(entries)
  const successRate = total > 0 ? success / total : 0
  const agenticCount = entries.filter(
    (entry) => entry.source === 'agentic',
  ).length
  const commandCount = entries.filter(
    (entry) => entry.source === 'command',
  ).length

  const lines: string[] = []
  const summaryCode = `${progressBar(successRate)} ${Math.round(successRate * 100)}% ok Â· ${total} calls`

  lines.push(`<b>📊 Metrics — last ${hoursBack}h</b>`)
  lines.push('')
  lines.push(
    `<code>${progressBar(successRate)} ${Math.round(successRate * 100)}% ok · ${total} calls</code>`,
  )

  lines[lines.length - 1] = `<code>${escapeHtml(summaryCode)}</code>`

  const summaryParts = [
    `🤖 Agentic: ${agenticCount}`,
    `⚡ Commands: ${commandCount}`,
  ]
  if (timeout > 0) summaryParts.push(`⏱ ${timeout} timeout`)
  if (error > 0) summaryParts.push(`❌ ${error} error`)
  if (fallback > 0) summaryParts.push(`↪ ${fallback} fallback`)
  lines.push(summaryParts.join('  '))

  const renderGroup = (title: string, items: MetricEntry[]) => {
    if (items.length === 0) return

    const byName = new Map<string, MetricEntry[]>()
    for (const entry of items) {
      if (!byName.has(entry.name)) {
        byName.set(entry.name, [])
      }
      byName.get(entry.name)?.push(entry)
    }

    lines.push('')
    lines.push(`<b>${title}</b>`)

    const rows: string[] = []
    for (const [name, group] of [...byName.entries()].sort(
      (left, right) => right[1].length - left[1].length,
    )) {
      const durations = group.map((entry) => entry.durationMs)
      rows.push(
        `${name}  ${group.length}× ~${fmtMs(median(durations))}${formatOutcomeSummary(group)}`,
      )
    }

    lines.push(`<pre>${rows.join('\n')}</pre>`)
    lines[lines.length - 1] = `<pre>${escapeHtml(rows.join('\n'))}</pre>`
  }

  renderGroup(
    '🤖 Agentic',
    entries.filter((entry) => entry.source === 'agentic'),
  )
  renderGroup(
    '⚡ Commands',
    entries.filter((entry) => entry.source === 'command'),
  )

  const modelEntries = entries.filter((entry) => entry.model)
  if (modelEntries.length > 0) {
    const byModel = new Map<string, MetricEntry[]>()
    for (const entry of modelEntries) {
      const modelName = entry.model ?? ''
      const label = entry.fallbackFrom
        ? `${shortModelName(modelName)} <= ${shortModelName(entry.fallbackFrom)}`
        : shortModelName(modelName)

      if (!byModel.has(label)) {
        byModel.set(label, [])
      }
      byModel.get(label)?.push(entry)
    }

    lines.push('')
    lines.push('<b>🧠 Models</b>')

    const rows: string[] = []
    for (const [label, group] of [...byModel.entries()].sort(
      (left, right) => right[1].length - left[1].length,
    )) {
      const durations = group.map((entry) => entry.durationMs)
      rows.push(
        `${label}  ${group.length}× ~${fmtMs(median(durations))}${formatOutcomeSummary(group)}`,
      )
    }

    lines.push(`<pre>${rows.join('\n')}</pre>`)
    lines[lines.length - 1] = `<pre>${escapeHtml(rows.join('\n'))}</pre>`
  }

  return lines.join('\n')
}
