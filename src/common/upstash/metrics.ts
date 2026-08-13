/**
 * Durable operational metrics for agent model and tool calls.
 *
 * Model calls and tool calls are intentionally separate. A tool may invoke a
 * model, in which case both operations are recorded with their own duration
 * and outcome.
 */

import { randomUUID } from 'node:crypto'

import { logger } from '../logger'
import { TtlCache } from '../ttl-cache'
import * as client from './client'

const METRICS_SCHEMA_VERSION = 2
const METRICS_KEY = `agent:metrics:v${METRICS_SCHEMA_VERSION}`
/** Keep metrics for 30 days. */
const METRICS_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const METRICS_MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000
const MAX_REPORT_GROUPS = 8
let redisClientOverride: ReturnType<typeof client.getRedisClient> | undefined
const metricsMaintenanceCache = new TtlCache<string, true>(
  METRICS_MAINTENANCE_INTERVAL_MS,
)

export type MetricStatus = 'success' | 'error' | 'timeout'
export type MetricSource = 'agentic' | 'command'
export type MetricType = 'model_call' | 'tool_call'

export interface MetricEntry {
  /** Unique member ID prevents equal concurrent calls from collapsing in Redis. */
  id?: string
  schemaVersion?: number
  type: MetricType
  source: MetricSource
  /** Stage or tool name, for example routing or generate_or_edit_image. */
  name: string
  /** Exact provider/model label for model_call entries only. */
  model?: string
  fallbackFrom?: string
  /** Explicit command attribution, without the leading slash. */
  command?: string
  chatId: number
  durationMs: number
  success: boolean
  status?: MetricStatus
  timestamp: number
}

export interface MetricOutcomeCounts {
  success: number
  timeout: number
  error: number
  fallback: number
}

export interface MetricGroupSummary extends MetricOutcomeCounts {
  label: string
  count: number
  medianMs: number
}

export interface MetricTimeBucket extends MetricOutcomeCounts {
  startMs: number
  endMs: number
  count: number
}

export interface MetricsReport {
  hours: number
  fromMs: number
  toMs: number
  totalOperations: number
  successRate: number
  medianMs: number
  outcomes: MetricOutcomeCounts
  modelCalls: number
  toolCalls: number
  modelMedianMs: number
  toolMedianMs: number
  agenticCalls: number
  commandCalls: number
  modelStages: MetricGroupSummary[]
  tools: MetricGroupSummary[]
  models: MetricGroupSummary[]
  commands: MetricGroupSummary[]
  timeline: MetricTimeBucket[]
}

type TimedCallOptions<T> = {
  type: MetricType
  source: MetricSource
  name: string
  model?: string
  fallbackFrom?: string
  command?: string
  chatId: number
  classifyResult?: (result: T) => MetricStatus
}

function normalizeMetricEntry(entry: MetricEntry): MetricEntry {
  const status = entry.status ?? (entry.success ? 'success' : 'error')
  return {
    ...entry,
    status,
    success: status === 'success',
  }
}

function isMetricEntry(value: unknown): value is MetricEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<MetricEntry>
  return (
    (entry.type === 'model_call' || entry.type === 'tool_call') &&
    (entry.source === 'agentic' || entry.source === 'command') &&
    typeof entry.name === 'string' &&
    entry.name.length > 0 &&
    typeof entry.chatId === 'number' &&
    Number.isFinite(entry.chatId) &&
    typeof entry.durationMs === 'number' &&
    Number.isFinite(entry.durationMs) &&
    entry.durationMs >= 0 &&
    typeof entry.timestamp === 'number' &&
    Number.isFinite(entry.timestamp)
  )
}

export function setMetricsRedisClientForTests(
  redis: ReturnType<typeof client.getRedisClient> | undefined,
): void {
  redisClientOverride = redis
}

export function clearMetricsMaintenanceCache(): void {
  metricsMaintenanceCache.clear()
}

function getMetricsRedisClient(): ReturnType<typeof client.getRedisClient> {
  if (redisClientOverride !== undefined) {
    return redisClientOverride
  }

  return client.getRedisClient()
}

async function maintainMetricsRetention(
  redis: NonNullable<ReturnType<typeof client.getRedisClient>>,
  now = Date.now(),
): Promise<void> {
  if (metricsMaintenanceCache.get(METRICS_KEY, now)) {
    return
  }

  // Claim the maintenance window before awaiting so concurrent model/tool
  // completions in one invocation do not all issue the same trim command.
  metricsMaintenanceCache.set(METRICS_KEY, true, now)
  try {
    await redis.zremrangebyscore(METRICS_KEY, 0, now - METRICS_TTL_MS)
  } catch (error) {
    metricsMaintenanceCache.delete(METRICS_KEY)
    logger.warn({ error }, 'metrics.cleanup_failed')
  }
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

/** Persist one metric. Failures remain non-fatal but are visible in logs. */
export async function recordMetric(entry: MetricEntry): Promise<void> {
  try {
    const redis = getMetricsRedisClient()
    if (!redis) return

    const timestamp = Number.isFinite(entry.timestamp)
      ? entry.timestamp
      : Date.now()
    const metricEntry = normalizeMetricEntry({
      ...entry,
      id: entry.id ?? randomUUID(),
      schemaVersion: METRICS_SCHEMA_VERSION,
      durationMs: Math.max(0, entry.durationMs),
      timestamp,
    })

    await Promise.all([
      redis.zadd(METRICS_KEY, {
        score: timestamp,
        member: JSON.stringify(metricEntry),
      }),
      maintainMetricsRetention(redis),
    ])
  } catch (error) {
    logger.warn(
      { error, metricType: entry.type, metricName: entry.name },
      'metrics.write_failed',
    )
  }
}

/** Time one logical operation and persist its actual outcome. */
export async function timedCall<T>(
  opts: TimedCallOptions<T>,
  fn: () => Promise<T>,
): Promise<T> {
  const { classifyResult, ...metricOpts } = opts
  const start = Date.now()

  try {
    const result = await fn()
    const end = Date.now()
    const status = classifyResult?.(result) ?? 'success'

    await recordMetric({
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

    await recordMetric({
      ...metricOpts,
      durationMs: end - start,
      success: false,
      status,
      timestamp: end,
    })

    throw error
  }
}

/** Retrieve v2 metric entries from Redis within a time range. */
export async function getMetrics(
  fromMs: number,
  toMs: number = Date.now(),
): Promise<MetricEntry[]> {
  try {
    const redis = getMetricsRedisClient()
    if (!redis) return []

    // The range remains exact even if best-effort physical cleanup fails.
    const [raw] = await Promise.all([
      redis.zrange(METRICS_KEY, fromMs, toMs, { byScore: true }),
      maintainMetricsRetention(redis),
    ])
    return (raw as unknown[])
      .map((value) => {
        try {
          const parsed =
            typeof value === 'string' ? (JSON.parse(value) as unknown) : value
          return isMetricEntry(parsed) ? normalizeMetricEntry(parsed) : null
        } catch {
          return null
        }
      })
      .filter((entry): entry is MetricEntry => entry !== null)
  } catch (error) {
    logger.warn({ error }, 'metrics.read_failed')
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

function getOutcomeCounts(entries: MetricEntry[]): MetricOutcomeCounts {
  return {
    success: entries.filter((entry) => entry.status === 'success').length,
    timeout: entries.filter((entry) => entry.status === 'timeout').length,
    error: entries.filter((entry) => entry.status === 'error').length,
    fallback: entries.filter((entry) => entry.fallbackFrom).length,
  }
}

function summarizeGroups(
  entries: MetricEntry[],
  getLabel: (entry: MetricEntry) => string | undefined,
): MetricGroupSummary[] {
  const groups = new Map<string, MetricEntry[]>()
  for (const entry of entries) {
    const label = getLabel(entry)?.trim()
    if (!label) continue
    groups.set(label, [...(groups.get(label) ?? []), entry])
  }

  return [...groups.entries()]
    .map(([label, group]) => ({
      label,
      count: group.length,
      medianMs: median(group.map((entry) => entry.durationMs)),
      ...getOutcomeCounts(group),
    }))
    .sort(
      (left, right) =>
        right.count - left.count || right.medianMs - left.medianMs,
    )
    .slice(0, MAX_REPORT_GROUPS)
}

function getTimeline(
  entries: MetricEntry[],
  fromMs: number,
  toMs: number,
  hours: number,
): MetricTimeBucket[] {
  const bucketCount = Math.min(24, Math.max(1, Math.ceil(hours)))
  const bucketMs = Math.max(1, (toMs - fromMs) / bucketCount)
  const buckets: MetricEntry[][] = Array.from({ length: bucketCount }, () => [])

  for (const entry of entries) {
    const index = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor((entry.timestamp - fromMs) / bucketMs)),
    )
    buckets[index]?.push(entry)
  }

  return buckets.map((bucketEntries, index) => ({
    startMs: Math.round(fromMs + index * bucketMs),
    endMs: Math.round(fromMs + (index + 1) * bucketMs),
    count: bucketEntries.length,
    ...getOutcomeCounts(bucketEntries),
  }))
}

export function clampMetricsHours(hoursBack = 24): number {
  return Math.max(1, Math.min(720, Math.trunc(hoursBack || 24)))
}

export function buildMetricsReport(
  entries: MetricEntry[],
  hoursBack = 24,
  toMs = Date.now(),
): MetricsReport {
  const hours = clampMetricsHours(hoursBack)
  const fromMs = toMs - hours * 60 * 60 * 1000
  const inRange = entries.filter(
    (entry) => entry.timestamp >= fromMs && entry.timestamp <= toMs,
  )
  const modelEntries = inRange.filter((entry) => entry.type === 'model_call')
  const toolEntries = inRange.filter((entry) => entry.type === 'tool_call')
  const outcomes = getOutcomeCounts(inRange)
  const totalOperations = inRange.length

  return {
    hours,
    fromMs,
    toMs,
    totalOperations,
    successRate: totalOperations ? outcomes.success / totalOperations : 0,
    medianMs: median(inRange.map((entry) => entry.durationMs)),
    outcomes,
    modelCalls: modelEntries.length,
    toolCalls: toolEntries.length,
    modelMedianMs: median(modelEntries.map((entry) => entry.durationMs)),
    toolMedianMs: median(toolEntries.map((entry) => entry.durationMs)),
    agenticCalls: inRange.filter((entry) => entry.source === 'agentic').length,
    commandCalls: inRange.filter((entry) => entry.source === 'command').length,
    modelStages: summarizeGroups(modelEntries, (entry) => entry.name),
    tools: summarizeGroups(toolEntries, (entry) => entry.name),
    models: summarizeGroups(modelEntries, (entry) => entry.model),
    commands: summarizeGroups(
      inRange.filter((entry) => entry.source === 'command'),
      (entry) => (entry.command ? `/${entry.command}` : undefined),
    ),
    timeline: getTimeline(inRange, fromMs, toMs, hours),
  }
}

export async function getMetricsReport(hoursBack = 24): Promise<MetricsReport> {
  const hours = clampMetricsHours(hoursBack)
  const toMs = Date.now()
  const fromMs = toMs - hours * 60 * 60 * 1000
  return buildMetricsReport(await getMetrics(fromMs, toMs), hours, toMs)
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

function progressBar(ratio: number, length = 12): string {
  const filled = Math.round(ratio * length)
  return '▰'.repeat(filled) + '▱'.repeat(length - filled)
}

function shortModelName(model: string): string {
  return model
    .replace(/^(?:google|openai)\//, '')
    .replace(/^gemini-/, '')
    .replace(/-preview$/, '')
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatOutcomeSummary(group: MetricGroupSummary): string {
  const parts = [`${Math.round((group.success / group.count) * 100)}% ok`]
  if (group.timeout) parts.push(`${group.timeout} t/o`)
  if (group.error) parts.push(`${group.error} err`)
  if (group.fallback) parts.push(`${group.fallback} fb`)
  return parts.join(' · ')
}

function formatGroup(title: string, groups: MetricGroupSummary[]): string[] {
  if (!groups.length) return []
  const rows = groups.map(
    (group) =>
      `${group.label}  ${group.count}× ~${fmtMs(group.medianMs)} (${formatOutcomeSummary(group)})`,
  )
  return ['', `<b>${title}</b>`, `<pre>${escapeHtml(rows.join('\n'))}</pre>`]
}

export function formatMetricsReport(report: MetricsReport): string {
  if (!report.totalOperations) {
    return `📊 No v2 metrics in the last ${report.hours}h`
  }

  const successPercent = Math.round(report.successRate * 100)
  const lines = [
    `<b>📊 AI operations · last ${report.hours}h</b>`,
    '',
    `<code>${progressBar(report.successRate)} ${successPercent}% healthy · ${report.totalOperations} operations</code>`,
    `🧠 Models: ${report.modelCalls}  🔧 Tools: ${report.toolCalls}  🤖 Agentic: ${report.agenticCalls}  ⚡ Commands: ${report.commandCalls}`,
  ]

  const incidents: string[] = []
  if (report.outcomes.timeout) {
    incidents.push(`⏱ ${report.outcomes.timeout} timeout`)
  }
  if (report.outcomes.error) incidents.push(`❌ ${report.outcomes.error} error`)
  if (report.outcomes.fallback) {
    incidents.push(`↪ ${report.outcomes.fallback} fallback`)
  }
  if (incidents.length) lines.push(incidents.join('  '))

  lines.push(...formatGroup('🧠 Model stages', report.modelStages))
  lines.push(...formatGroup('🔧 Tools', report.tools))
  lines.push(
    ...formatGroup(
      '⚙ Models',
      report.models.map((group) => ({
        ...group,
        label: shortModelName(group.label),
      })),
    ),
  )
  lines.push(...formatGroup('⚡ Commands', report.commands))

  return lines.join('\n')
}
