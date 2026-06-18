import type {
  CurrencyMessages,
  CurrencyRateRow,
  CurrencyRateSection,
} from './types'

const DEFAULT_TITLE = '💱 Курсы'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function normalizeRichHtmlLine(value: string) {
  return value.replace(/\r?\n/g, ' ').trim()
}

function formatRichLabel(label: string) {
  const flagLabel = label.replace(/^([\u{1F1E6}-\u{1F1FF}]{2})(?=\S)/u, '$1 ')

  return flagLabel === label
    ? label.replace(/^(\p{Emoji_Presentation})(?=\S)/u, '$1 ')
    : flagLabel
}

function getRowCells(row: CurrencyRateRow, columnCount: number): string[] {
  const value =
    columnCount > 2 && row.change ? `${row.value} (${row.change})` : row.value
  const cells = [formatRichLabel(row.label), value]

  if (columnCount > 2) {
    cells.push(row.change ?? '')
  }

  return cells
}

function buildRichTable(section: CurrencyRateSection): string {
  if (section.error) {
    return `<i>${escapeHtml(section.error)}</i>`
  }

  if (section.rows.length === 0) {
    return '<i>No data</i>'
  }

  const columnCount = section.columns?.length ?? 2
  const rows = section.rows.map((row) => {
    const cells = getRowCells(row, columnCount)
    return `<tr>${cells
      .map((cell, index) => {
        const align = index === 0 ? 'left' : 'right'
        return `<td align="${align}">${escapeHtml(normalizeRichHtmlLine(cell))}</td>`
      })
      .join('')}</tr>`
  })

  return `<table bordered striped>${rows.join('')}</table>`
}

function buildFallbackLines(section: CurrencyRateSection): string[] {
  if (section.error) {
    return [section.error]
  }

  if (section.rows.length === 0) {
    return ['No data']
  }

  return section.rows.map(
    (row) =>
      `${row.label}: ${row.value}${row.change ? ` (${row.change})` : ''}`,
  )
}

function buildSectionTitle(section: CurrencyRateSection): string {
  const provider = section.provider ? ` (${section.provider})` : ''
  return `${section.title}${provider}`
}

export function buildCurrencyRichMessage(
  sections: CurrencyRateSection[],
  title = DEFAULT_TITLE,
): CurrencyMessages['richMessage'] {
  const lines = [`<b>${escapeHtml(title)}</b>`]

  for (const section of sections) {
    lines.push(
      '',
      `<b>${escapeHtml(buildSectionTitle(section))}</b>`,
      buildRichTable(section),
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
    text: buildCurrencyFallbackText(sections),
    richMessage: buildCurrencyRichMessage(sections),
  }
}
