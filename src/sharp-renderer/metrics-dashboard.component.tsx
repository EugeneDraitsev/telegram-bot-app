import ReactDOMServer from 'react-dom/server'

import type { MetricGroupSummary, MetricsReport } from '@tg-bot/common'

const WIDTH = 1200
const HEIGHT = 980
const PADDING = 56
const CONTENT_WIDTH = WIDTH - PADDING * 2
const CARD_GAP = 18
const CARD_WIDTH = (CONTENT_WIDTH - CARD_GAP * 3) / 4

const COLORS = {
  background: '#07111f',
  surface: '#0e1b2d',
  surfaceStrong: '#13243a',
  border: '#203754',
  text: '#f4f7fb',
  muted: '#91a6c3',
  grid: '#1b304a',
  blue: '#60a5fa',
  cyan: '#22d3ee',
  green: '#34d399',
  amber: '#fbbf24',
  red: '#fb7185',
  violet: '#a78bfa',
} as const

function formatDuration(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

function formatGeneratedAt(timestamp: number) {
  return new Date(timestamp)
    .toISOString()
    .replace('T', ' ')
    .replace(/:\d{2}\.\d{3}Z$/, ' UTC')
}

function successPercent(group: MetricGroupSummary) {
  return group.count ? Math.round((group.success / group.count) * 100) : 0
}

function truncateLabel(label: string, maxLength = 31) {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label
}

function StatCard({
  index,
  label,
  value,
  detail,
  accent,
}: {
  index: number
  label: string
  value: string
  detail: string
  accent: string
}) {
  const x = PADDING + index * (CARD_WIDTH + CARD_GAP)
  const y = 116

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={CARD_WIDTH}
        height={126}
        rx={20}
        fill={COLORS.surface}
        stroke={COLORS.border}
      />
      <rect x={x} y={y} width={5} height={126} rx={2.5} fill={accent} />
      <text x={x + 24} y={y + 33} fill={COLORS.muted} fontSize={16}>
        {label.toUpperCase()}
      </text>
      <text
        x={x + 24}
        y={y + 79}
        fill={COLORS.text}
        fontSize={38}
        fontWeight={700}
      >
        {value}
      </text>
      <text x={x + 24} y={y + 106} fill={COLORS.muted} fontSize={15}>
        {detail}
      </text>
    </g>
  )
}

function ActivityChart({ report }: { report: MetricsReport }) {
  const x = PADDING
  const y = 282
  const width = CONTENT_WIDTH
  const height = 258
  const plotX = x + 28
  const plotY = y + 62
  const plotWidth = width - 56
  const plotHeight = 144
  const maxCount = Math.max(1, ...report.timeline.map((bucket) => bucket.count))
  const slotWidth = plotWidth / Math.max(1, report.timeline.length)
  const barWidth = Math.max(7, Math.min(30, slotWidth * 0.62))

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={22}
        fill={COLORS.surface}
        stroke={COLORS.border}
      />
      <text
        x={x + 28}
        y={y + 34}
        fill={COLORS.text}
        fontSize={20}
        fontWeight={700}
      >
        OPERATION VOLUME
      </text>
      <text
        x={x + width - 28}
        y={y + 34}
        fill={COLORS.muted}
        fontSize={15}
        textAnchor="end"
      >
        success / timeout / error
      </text>

      {[0, 0.5, 1].map((ratio) => {
        const gridY = plotY + plotHeight * ratio
        return (
          <line
            key={ratio}
            x1={plotX}
            y1={gridY}
            x2={plotX + plotWidth}
            y2={gridY}
            stroke={COLORS.grid}
          />
        )
      })}

      {report.timeline.map((bucket, index) => {
        const centerX = plotX + slotWidth * index + slotWidth / 2
        const totalHeight = (bucket.count / maxCount) * plotHeight
        const successHeight = bucket.count
          ? (bucket.success / bucket.count) * totalHeight
          : 0
        const timeoutHeight = bucket.count
          ? (bucket.timeout / bucket.count) * totalHeight
          : 0
        const errorHeight = bucket.count
          ? (bucket.error / bucket.count) * totalHeight
          : 0
        const bottom = plotY + plotHeight

        return (
          <g key={bucket.startMs}>
            {bucket.count === 0 ? (
              <rect
                x={centerX - barWidth / 2}
                y={bottom - 2}
                width={barWidth}
                height={2}
                rx={1}
                fill={COLORS.grid}
              />
            ) : null}
            <rect
              x={centerX - barWidth / 2}
              y={bottom - successHeight}
              width={barWidth}
              height={successHeight}
              rx={successHeight === totalHeight ? 4 : 0}
              fill={COLORS.green}
            />
            <rect
              x={centerX - barWidth / 2}
              y={bottom - successHeight - timeoutHeight}
              width={barWidth}
              height={timeoutHeight}
              fill={COLORS.amber}
            />
            <rect
              x={centerX - barWidth / 2}
              y={bottom - successHeight - timeoutHeight - errorHeight}
              width={barWidth}
              height={errorHeight}
              rx={4}
              fill={COLORS.red}
            />
          </g>
        )
      })}

      <text x={plotX} y={y + 230} fill={COLORS.muted} fontSize={14}>
        -{report.hours}h
      </text>
      <text
        x={plotX + plotWidth / 2}
        y={y + 230}
        fill={COLORS.muted}
        fontSize={14}
        textAnchor="middle"
      >
        -{Math.round(report.hours / 2)}h
      </text>
      <text
        x={plotX + plotWidth}
        y={y + 230}
        fill={COLORS.muted}
        fontSize={14}
        textAnchor="end"
      >
        now
      </text>
    </g>
  )
}

function BusiestOperations({ report }: { report: MetricsReport }) {
  const x = PADDING
  const y = 580
  const width = 530
  const rows = [
    ...report.modelStages.map((group) => ({ ...group, kind: 'M' })),
    ...report.tools.map((group) => ({ ...group, kind: 'T' })),
  ]
    .sort(
      (left, right) =>
        right.count - left.count || right.medianMs - left.medianMs,
    )
    .slice(0, 6)
  const maxCount = Math.max(1, ...rows.map((row) => row.count))

  return (
    <g>
      <text x={x} y={y} fill={COLORS.text} fontSize={20} fontWeight={700}>
        BUSIEST OPERATIONS
      </text>
      <text
        x={x + width}
        y={y}
        fill={COLORS.muted}
        fontSize={14}
        textAnchor="end"
      >
        count · p50 latency
      </text>
      {rows.map((row, index) => {
        const rowY = y + 34 + index * 55
        const barWidth = (row.count / maxCount) * (width - 190)
        return (
          <g key={`${row.kind}-${row.label}`}>
            <rect
              x={x}
              y={rowY}
              width={34}
              height={26}
              rx={8}
              fill={row.kind === 'M' ? COLORS.violet : COLORS.blue}
              opacity={0.2}
            />
            <text
              x={x + 17}
              y={rowY + 18}
              fill={row.kind === 'M' ? COLORS.violet : COLORS.blue}
              fontSize={13}
              fontWeight={700}
              textAnchor="middle"
            >
              {row.kind}
            </text>
            <text x={x + 46} y={rowY + 18} fill={COLORS.text} fontSize={16}>
              {truncateLabel(row.label, 27)}
            </text>
            <text
              x={x + width}
              y={rowY + 18}
              fill={COLORS.muted}
              fontSize={15}
              textAnchor="end"
            >
              {row.count}× · {formatDuration(row.medianMs)}
            </text>
            <rect
              x={x + 46}
              y={rowY + 34}
              width={width - 46}
              height={5}
              rx={2.5}
              fill={COLORS.grid}
            />
            <rect
              x={x + 46}
              y={rowY + 34}
              width={Math.max(3, barWidth)}
              height={5}
              rx={2.5}
              fill={row.kind === 'M' ? COLORS.violet : COLORS.blue}
            />
          </g>
        )
      })}
    </g>
  )
}

function ModelRows({ report }: { report: MetricsReport }) {
  const x = 626
  const y = 580
  const width = WIDTH - PADDING - x
  const rows = report.models.slice(0, 6)

  return (
    <g>
      <text x={x} y={y} fill={COLORS.text} fontSize={20} fontWeight={700}>
        MODELS
      </text>
      <text
        x={x + width}
        y={y}
        fill={COLORS.muted}
        fontSize={14}
        textAnchor="end"
      >
        health · calls · p50
      </text>
      {rows.map((row, index) => {
        const rowY = y + 34 + index * 55
        const percent = successPercent(row)
        const healthColor =
          percent >= 95
            ? COLORS.green
            : percent >= 80
              ? COLORS.amber
              : COLORS.red

        return (
          <g key={row.label}>
            <circle cx={x + 7} cy={rowY + 12} r={6} fill={healthColor} />
            <text x={x + 24} y={rowY + 18} fill={COLORS.text} fontSize={16}>
              {truncateLabel(row.label, 29)}
            </text>
            <text
              x={x + width}
              y={rowY + 18}
              fill={COLORS.muted}
              fontSize={15}
              textAnchor="end"
            >
              {percent}% · {row.count}× · {formatDuration(row.medianMs)}
            </text>
            <rect
              x={x + 24}
              y={rowY + 34}
              width={width - 24}
              height={5}
              rx={2.5}
              fill={COLORS.grid}
            />
            <rect
              x={x + 24}
              y={rowY + 34}
              width={((width - 24) * percent) / 100}
              height={5}
              rx={2.5}
              fill={healthColor}
            />
          </g>
        )
      })}
    </g>
  )
}

export function MetricsDashboard({ report }: { report: MetricsReport }) {
  const success = Math.round(report.successRate * 100)
  const incidents = report.outcomes.timeout + report.outcomes.error

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      xmlns="http://www.w3.org/2000/svg"
      fontFamily="Roboto, Arial, sans-serif"
    >
      <title>AI operations metrics dashboard</title>
      <desc>
        {success}% successful across {report.totalOperations} model and tool
        operations in the last {report.hours} hours.
      </desc>
      <defs>
        <linearGradient id="metrics-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={COLORS.background} />
          <stop offset="1" stopColor="#0a1830" />
        </linearGradient>
        <radialGradient id="metrics-glow" cx="0.78" cy="0.05" r="0.62">
          <stop offset="0" stopColor={COLORS.blue} stopOpacity={0.14} />
          <stop offset="1" stopColor={COLORS.blue} stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect width={WIDTH} height={HEIGHT} fill="url(#metrics-bg)" />
      <rect width={WIDTH} height={HEIGHT} fill="url(#metrics-glow)" />

      <text
        x={PADDING}
        y={54}
        fill={COLORS.cyan}
        fontSize={15}
        fontWeight={700}
      >
        AI OPERATIONS
      </text>
      <text
        x={PADDING}
        y={91}
        fill={COLORS.text}
        fontSize={31}
        fontWeight={700}
      >
        Last {report.hours} hours
      </text>
      <text
        x={WIDTH - PADDING}
        y={81}
        fill={COLORS.muted}
        fontSize={15}
        textAnchor="end"
      >
        {formatGeneratedAt(report.toMs)}
      </text>

      <StatCard
        index={0}
        label="Operation health"
        value={`${success}%`}
        detail={`${report.outcomes.success}/${report.totalOperations} successful`}
        accent={
          success >= 95
            ? COLORS.green
            : success >= 80
              ? COLORS.amber
              : COLORS.red
        }
      />
      <StatCard
        index={1}
        label="Model calls"
        value={String(report.modelCalls)}
        detail={`${formatDuration(report.modelMedianMs)} p50 latency`}
        accent={COLORS.violet}
      />
      <StatCard
        index={2}
        label="Tool calls"
        value={String(report.toolCalls)}
        detail={`${formatDuration(report.toolMedianMs)} p50 latency`}
        accent={COLORS.blue}
      />
      <StatCard
        index={3}
        label="Incidents"
        value={String(incidents)}
        detail={`${report.outcomes.fallback} fallbacks · ${report.outcomes.timeout} timeouts`}
        accent={incidents ? COLORS.red : COLORS.green}
      />

      <ActivityChart report={report} />
      <BusiestOperations report={report} />
      <ModelRows report={report} />

      <line
        x1={PADDING}
        y1={932}
        x2={WIDTH - PADDING}
        y2={932}
        stroke={COLORS.border}
      />
      <text x={PADDING} y={960} fill={COLORS.muted} fontSize={15}>
        Agentic {report.agenticCalls} ops · Commands {report.commandCalls} ops
      </text>
      <text
        x={WIDTH - PADDING}
        y={960}
        fill={COLORS.muted}
        fontSize={15}
        textAnchor="end"
      >
        M = model stage · T = tool
      </text>
    </svg>
  )
}

export function getMetricsDashboardSvg(report: MetricsReport): string {
  return ReactDOMServer.renderToStaticMarkup(
    <MetricsDashboard report={report} />,
  )
}
