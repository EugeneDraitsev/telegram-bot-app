import ReactDOMServer from 'react-dom/server'
import type { ReactNode } from 'react'

import type { CurrencyRateSection } from '@tg-bot/common'

const WIDTH = 520
const PADDING = 20
const SECTION_GAP = 24
const TITLE_HEIGHT = 32
const TITLE_GAP = 10
const ROW_HEIGHT = 50
const HEADER_HEIGHT = 42
const TABLE_RADIUS = 14
const ICON_SIZE = 26
const VALUE_RIGHT = WIDTH - PADDING - 18
const VALUE_COLUMN_WIDTH = 86

type IconKind = 'belarus' | 'sweden' | 'poland' | 'ukraine' | 'oil'

interface DisplayRow {
  readonly icon?: IconKind
  readonly label: string
  readonly values: string[]
}

interface SectionLayout {
  readonly section: CurrencyRateSection
  readonly rows: DisplayRow[]
  readonly columns: string[]
  readonly showHeader: boolean
  readonly y: number
  readonly tableY: number
  readonly tableHeight: number
}

function normalizeLine(value: string) {
  return value.replace(/\r?\n/g, ' ').trim()
}

function getBackgroundImageMediaType(backgroundImage: string) {
  if (backgroundImage.startsWith('/9j/')) return 'image/jpeg'
  if (backgroundImage.startsWith('UklGR')) return 'image/webp'
  return 'image/png'
}

function splitIcon(label: string): { icon?: IconKind; label: string } {
  const normalized = normalizeLine(label)
  const iconMap: Array<[string, IconKind]> = [
    ['🇧🇾', 'belarus'],
    ['🇸🇪', 'sweden'],
    ['🇵🇱', 'poland'],
    ['🇺🇦', 'ukraine'],
    ['🛢️', 'oil'],
    ['🛢', 'oil'],
  ]
  const match = iconMap.find(([emoji]) => normalized.startsWith(emoji))

  if (!match) {
    return { label: normalized }
  }

  return {
    icon: match[1],
    label: normalized.slice(match[0].length).trim(),
  }
}

function getSectionTitle(section: CurrencyRateSection) {
  const provider = section.provider ? ` (${section.provider})` : ''
  return `${section.title}${provider}`
}

function getRows(section: CurrencyRateSection): DisplayRow[] {
  if (section.error) {
    return [{ label: section.error, values: [''] }]
  }

  if (section.rows.length === 0) {
    return [{ label: 'No data', values: [''] }]
  }

  return section.rows.map((row) => {
    const { icon, label } = splitIcon(row.label)
    return {
      icon,
      label,
      values: row.values?.length
        ? row.values.map(normalizeLine)
        : [
            normalizeLine(
              row.change
                ? `${row.value ?? ''} (${row.change})`
                : (row.value ?? ''),
            ),
          ],
    }
  })
}

function getColumns(section: CurrencyRateSection, rows: DisplayRow[]) {
  const valueColumnCount = Math.max(
    1,
    ...rows.map((row) => row.values.length),
    (section.columns?.length ?? 1) - 1,
  )
  return Array.from(
    { length: valueColumnCount },
    (_, index) => section.columns?.[index + 1] ?? '',
  )
}

function getLayouts(sections: CurrencyRateSection[]) {
  let y = PADDING
  return sections.map((section) => {
    const rows = getRows(section)
    const columns = getColumns(section, rows)
    const tableY = y + TITLE_HEIGHT + TITLE_GAP
    const showHeader = (section.columns?.length ?? 0) > 2
    const headerHeight = showHeader ? HEADER_HEIGHT : 0
    const tableHeight = headerHeight + rows.length * ROW_HEIGHT
    const layout = {
      section,
      rows,
      columns,
      showHeader,
      y,
      tableY,
      tableHeight,
    }

    y = tableY + tableHeight + SECTION_GAP
    return layout
  })
}

function getHeight(layouts: SectionLayout[]) {
  const lastLayout = layouts.at(-1)
  if (!lastLayout) {
    return PADDING * 2
  }

  return lastLayout.tableY + lastLayout.tableHeight + PADDING
}

function RoundedFlag({
  kind,
  x,
  y,
  children,
  borderOpacity = 0.65,
}: {
  readonly kind: IconKind
  readonly x: number
  readonly y: number
  readonly children: ReactNode
  readonly borderOpacity?: number
}) {
  const clipId = `flag-clip-${kind}-${x}-${Math.round(y)}`

  return (
    <g transform={`translate(${x} ${y})`}>
      <defs>
        <clipPath id={clipId}>
          <rect width={ICON_SIZE} height={ICON_SIZE} rx={6} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>{children}</g>
      <rect
        width={ICON_SIZE}
        height={ICON_SIZE}
        rx={6}
        fill="none"
        stroke="#d4d9e2"
        opacity={borderOpacity}
      />
    </g>
  )
}

function FlagIcon({
  kind,
  x,
  y,
}: {
  readonly kind: IconKind
  readonly x: number
  readonly y: number
}) {
  if (kind === 'sweden') {
    return (
      <RoundedFlag kind={kind} x={x} y={y}>
        <rect width={ICON_SIZE} height={ICON_SIZE} rx={6} fill="#0b63a3" />
        <rect x={9} width={4} height={ICON_SIZE} fill="#f6c945" />
        <rect y={11} width={ICON_SIZE} height={4} fill="#f6c945" />
      </RoundedFlag>
    )
  }

  if (kind === 'poland') {
    return (
      <RoundedFlag kind={kind} x={x} y={y} borderOpacity={0.85}>
        <rect width={ICON_SIZE} height={ICON_SIZE} rx={6} fill="#ffffff" />
        <rect
          y={ICON_SIZE / 2}
          width={ICON_SIZE}
          height={ICON_SIZE / 2}
          fill="#dc143c"
        />
      </RoundedFlag>
    )
  }

  if (kind === 'ukraine') {
    return (
      <RoundedFlag kind={kind} x={x} y={y}>
        <rect width={ICON_SIZE} height={ICON_SIZE} rx={6} fill="#1d4ed8" />
        <rect
          y={ICON_SIZE / 2}
          width={ICON_SIZE}
          height={ICON_SIZE / 2}
          fill="#facc15"
        />
      </RoundedFlag>
    )
  }

  if (kind === 'oil') {
    return (
      <g transform={`translate(${x} ${y})`}>
        <ellipse
          cx={14}
          cy={24}
          rx={8.2}
          ry={1.8}
          fill="#0f172a"
          opacity={0.28}
        />
        <path
          d="M5.2 6.4c0-2.3 3.5-4.2 7.8-4.2s7.8 1.9 7.8 4.2v14.1c0 2.3-3.5 4.2-7.8 4.2s-7.8-1.9-7.8-4.2z"
          fill="#b91c1c"
        />
        <path
          d="M7.1 7.8v11.7c0 1.4 2.6 2.6 5.9 2.6s5.9-1.2 5.9-2.6V7.8"
          fill="#dc2626"
        />
        <ellipse cx={13} cy={6.4} rx={7.8} ry={4.2} fill="#f87171" />
        <ellipse
          cx={13}
          cy={6.4}
          rx={4.8}
          ry={2.1}
          fill="#991b1b"
          opacity={0.55}
        />
        <ellipse cx={13} cy={21} rx={8} ry={4} fill="#7f1d1d" />
        <path
          d="M6.8 11.8h12.4M6.8 16.7h12.4"
          stroke="#fecaca"
          strokeLinecap="round"
          strokeWidth={1.5}
          opacity={0.9}
        />
        <path
          d="M8.1 8v11.4M17.9 8v11.4"
          stroke="#7f1d1d"
          strokeLinecap="round"
          strokeWidth={1.2}
          opacity={0.48}
        />
        <path
          d="M8.8 8.8v9.2"
          stroke="#fca5a5"
          strokeLinecap="round"
          strokeWidth={1.2}
          opacity={0.78}
        />
        <path
          d="M22.5 14.4c1.2 1.5 1.8 2.6 1.8 3.5 0 1.3-.9 2.2-2 2.2s-2-.9-2-2.2c0-.9.7-2 2.2-3.5z"
          fill="#38bdf8"
          opacity={0.9}
        />
      </g>
    )
  }

  return (
    <RoundedFlag kind={kind} x={x} y={y} borderOpacity={0.85}>
      <rect width={ICON_SIZE} height={ICON_SIZE} rx={6} fill="#ffffff" />
      <rect
        y={ICON_SIZE / 3}
        width={ICON_SIZE}
        height={ICON_SIZE / 3}
        fill="#d91f2d"
      />
    </RoundedFlag>
  )
}

function Section({
  hasBackgroundImage,
  layout,
}: {
  readonly hasBackgroundImage: boolean
  readonly layout: SectionLayout
}) {
  const { section, rows, columns, showHeader, y, tableY, tableHeight } = layout
  const tableX = PADDING
  const tableWidth = WIDTH - PADDING * 2
  const headerHeight = showHeader ? HEADER_HEIGHT : 0
  const valueX = (index: number) =>
    VALUE_RIGHT - (columns.length - 1 - index) * VALUE_COLUMN_WIDTH
  const tableFill = hasBackgroundImage ? '#111827' : '#1f2a3a'
  const rowFill = hasBackgroundImage ? '#172033' : '#263449'
  const headerFill = hasBackgroundImage ? '#0f172a' : '#1b2636'
  const tableOpacity = hasBackgroundImage ? 0.88 : undefined

  return (
    <g>
      <text
        x={PADDING}
        y={y + 27}
        fill="#f8fafc"
        fontFamily="Roboto, Arial, sans-serif"
        fontSize={24}
        fontWeight={700}
      >
        {getSectionTitle(section)}
      </text>
      <rect
        x={tableX}
        y={tableY}
        width={tableWidth}
        height={tableHeight}
        rx={TABLE_RADIUS}
        fill={tableFill}
        opacity={tableOpacity}
        stroke="#40516a"
      />
      {showHeader ? (
        <g>
          <rect
            x={tableX}
            y={tableY}
            width={tableWidth}
            height={HEADER_HEIGHT}
            rx={TABLE_RADIUS}
            fill={headerFill}
            opacity={tableOpacity}
          />
          <line
            x1={tableX}
            y1={tableY + HEADER_HEIGHT}
            x2={tableX + tableWidth}
            y2={tableY + HEADER_HEIGHT}
            stroke="#40516a"
          />
          {columns.map((column, index) => (
            <text
              key={column}
              x={valueX(index)}
              y={tableY + 29}
              fill="#cbd5e1"
              fontFamily="Roboto, Arial, sans-serif"
              fontSize={20}
              fontWeight={700}
              textAnchor="end"
            >
              {column}
            </text>
          ))}
        </g>
      ) : null}
      {rows.map((row, rowIndex) => {
        const rowY = tableY + headerHeight + rowIndex * ROW_HEIGHT
        const centerY = rowY + ROW_HEIGHT / 2
        const iconY = centerY - ICON_SIZE / 2
        const isLastRow = rowIndex === rows.length - 1
        const labelX = row.icon ? tableX + 58 : tableX + 24

        return (
          <g key={`${row.label}-${row.values.join('-')}`}>
            {rowIndex % 2 === 0 ? (
              <rect
                x={tableX}
                y={rowY}
                width={tableWidth}
                height={ROW_HEIGHT}
                rx={isLastRow ? TABLE_RADIUS : 0}
                fill={rowFill}
                opacity={hasBackgroundImage ? 0.8 : 0.72}
              />
            ) : null}
            {!isLastRow ? (
              <line
                x1={tableX}
                y1={rowY + ROW_HEIGHT}
                x2={tableX + tableWidth}
                y2={rowY + ROW_HEIGHT}
                stroke="#40516a"
              />
            ) : null}
            {row.icon ? (
              <FlagIcon kind={row.icon} x={tableX + 20} y={iconY} />
            ) : null}
            <text
              x={labelX}
              y={centerY + 9}
              fill="#f8fafc"
              fontFamily="Roboto, Arial, sans-serif"
              fontSize={25}
              fontWeight={500}
            >
              {row.label}
            </text>
            {columns.map((_, index) => (
              <text
                key={`${row.label}-${columns[index] || row.values[index] || 'value'}`}
                x={valueX(index)}
                y={centerY + 9}
                fill="#f8fafc"
                fontFamily="Roboto, Arial, sans-serif"
                fontSize={25}
                fontWeight={500}
                textAnchor="end"
              >
                {row.values[index] ?? ''}
              </text>
            ))}
          </g>
        )
      })}
    </g>
  )
}

export function CurrencyRates({
  backgroundImage,
  sections,
}: {
  readonly backgroundImage?: string
  readonly sections: CurrencyRateSection[]
}) {
  const layouts = getLayouts(sections)
  const height = getHeight(layouts)
  const hasBackgroundImage = Boolean(backgroundImage)

  return (
    <svg
      width={WIDTH}
      height={height}
      viewBox={`0 0 ${WIDTH} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Currency rates</title>
      <defs>
        <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#111827" />
          <stop offset="55%" stopColor="#18263a" />
          <stop offset="100%" stopColor="#241d36" />
        </linearGradient>
        <linearGradient id="background-overlay" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#020617" stopOpacity={0.58} />
          <stop offset="48%" stopColor="#020617" stopOpacity={0.68} />
          <stop offset="100%" stopColor="#020617" stopOpacity={0.78} />
        </linearGradient>
        <filter id="background-blur" x="-4%" y="-4%" width="108%" height="108%">
          <feGaussianBlur stdDeviation={2.4} />
        </filter>
      </defs>
      {backgroundImage ? (
        <g>
          <image
            href={`data:${getBackgroundImageMediaType(backgroundImage)};base64,${backgroundImage}`}
            x={0}
            y={0}
            width={WIDTH}
            height={height}
            preserveAspectRatio="xMidYMid slice"
            filter="url(#background-blur)"
          />
          <rect width={WIDTH} height={height} fill="url(#background-overlay)" />
        </g>
      ) : (
        <g>
          <rect width={WIDTH} height={height} fill="url(#background)" />
          <circle cx={478} cy={48} r={50} fill="#10b981" opacity={0.12} />
          <circle
            cx={44}
            cy={height - 58}
            r={68}
            fill="#60a5fa"
            opacity={0.1}
          />
        </g>
      )}
      {layouts.map((layout) => (
        <Section
          key={`${layout.section.title}-${layout.y}`}
          hasBackgroundImage={hasBackgroundImage}
          layout={layout}
        />
      ))}
    </svg>
  )
}

export const getCurrencyRatesSvg = (
  sections: CurrencyRateSection[],
  backgroundImage?: string,
): string =>
  ReactDOMServer.renderToStaticMarkup(
    <CurrencyRates backgroundImage={backgroundImage} sections={sections} />,
  )
