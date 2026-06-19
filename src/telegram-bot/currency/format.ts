import type { CurrencyMessages, CurrencyRateSection } from './types'

const COLUMN_GAP = 3
const LEADING_SPACE_GUARD = '-'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function normalizeHtmlLine(value: string) {
  return value.replace(/\r?\n/g, ' ').trim()
}

function formatLabel(label: string) {
  const oilLabel = label.replace(/^(\u{1F6E2})\uFE0F?(?=\S)/u, '$1 ')
  if (oilLabel !== label) {
    return oilLabel
  }

  const flagLabel = label.replace(/^([\u{1F1E6}-\u{1F1FF}]{2})(?=\S)/u, '$1 ')

  return flagLabel === label
    ? label.replace(/^([\u{1F300}-\u{1FAFF}]\uFE0F?)(?=\S)/u, '$1 ')
    : flagLabel
}

function visibleWidth(value: string) {
  let width = 0

  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0

    if (
      codePoint === 0x200b ||
      codePoint === 0x200d ||
      (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
      (codePoint >= 0x0300 && codePoint <= 0x036f)
    ) {
      continue
    }

    if (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff) {
      width += 1
      continue
    }

    width += codePoint >= 0x1f300 && codePoint <= 0x1faff ? 2 : 1
  }

  return width
}

function padEndVisible(value: string, width: number) {
  return value + ' '.repeat(Math.max(0, width - visibleWidth(value)))
}

function padStartVisible(value: string, width: number) {
  return ' '.repeat(Math.max(0, width - visibleWidth(value))) + value
}

function getRowValues(row: CurrencyRateSection['rows'][number]) {
  if (row.values?.length) {
    return row.values.map(normalizeHtmlLine)
  }

  return [
    normalizeHtmlLine(
      row.change ? `${row.value ?? ''} (${row.change})` : (row.value ?? ''),
    ),
  ]
}

function getPreRows(section: CurrencyRateSection) {
  const bodyRows = section.rows.map((row) => {
    const label = formatLabel(normalizeHtmlLine(row.label))
    return [label, ...getRowValues(row)]
  })
  const header =
    section.columns?.length === bodyRows[0]?.length &&
    section.columns.length > 2
      ? section.columns.map(normalizeHtmlLine)
      : undefined

  return header ? [header, ...bodyRows] : bodyRows
}

function getColumnWidths(rows: string[][]) {
  return rows[0].map((_, index) =>
    Math.max(...rows.map((row) => visibleWidth(row[index] ?? ''))),
  )
}

function preserveFirstLineIndent(lines: string[]) {
  const firstLine = lines[0]
  if (firstLine?.startsWith(' ')) {
    return [
      firstLine.replace(
        /^ +/,
        (spaces) => `${LEADING_SPACE_GUARD}${' '.repeat(spaces.length - 1)}`,
      ),
      ...lines.slice(1),
    ]
  }

  return lines
}

function buildPreTable(section: CurrencyRateSection): string {
  if (section.error) {
    return `<i>${escapeHtml(section.error)}</i>`
  }

  if (section.rows.length === 0) {
    return '<i>No data</i>'
  }

  const rows = getPreRows(section)

  const widths = getColumnWidths(rows)
  const gap = ' '.repeat(COLUMN_GAP)

  const lines = rows.map((row) =>
    row
      .map((cell, index) =>
        index === 0
          ? padEndVisible(cell, widths[index])
          : padStartVisible(cell, widths[index]),
      )
      .join(gap),
  )

  return `<pre>${escapeHtml(preserveFirstLineIndent(lines).join('\n'))}</pre>`
}

function buildFallbackLines(section: CurrencyRateSection): string[] {
  if (section.error) {
    return [section.error]
  }

  if (section.rows.length === 0) {
    return ['No data']
  }

  const valueColumnNames = section.columns?.slice(1) ?? []

  return section.rows.map((row) => {
    const values = getRowValues(row)
    const formattedValues =
      values.length > 1
        ? values
            .map((value, index) =>
              valueColumnNames[index]
                ? `${valueColumnNames[index]} ${value}`
                : value,
            )
            .join(', ')
        : values[0]

    return `${formatLabel(row.label)}: ${formattedValues}`
  })
}

function buildSectionTitle(section: CurrencyRateSection): string {
  const provider = section.provider ? ` (${section.provider})` : ''
  return `${section.title}${provider}`
}

export function buildCurrencyRichMessage(
  sections: CurrencyRateSection[],
  title = '',
): CurrencyMessages['richMessage'] {
  const lines = title ? [`<b>${escapeHtml(title)}</b>`] : []

  for (const section of sections) {
    if (lines.length > 0) {
      lines.push('')
    }

    lines.push(
      `<b>${escapeHtml(buildSectionTitle(section))}</b>`,
      buildPreTable(section),
    )
  }

  return {
    html: lines.join('\n'),
    skip_entity_detection: true,
  }
}

export function buildCurrencyFallbackText(
  sections: CurrencyRateSection[],
): string {
  const lines: string[] = []
  for (const section of sections) {
    if (lines.length > 0) {
      lines.push('')
    }

    lines.push(`<b>${escapeHtml(`${buildSectionTitle(section)}:`)}</b>`)
    lines.push(...buildFallbackLines(section).map(escapeHtml))
  }

  return lines.join('\n')
}

export function buildCurrencyMessages(
  sections: CurrencyRateSection[],
): CurrencyMessages {
  return {
    sections,
    text: buildCurrencyFallbackText(sections),
    richMessage: buildCurrencyRichMessage(sections),
  }
}
