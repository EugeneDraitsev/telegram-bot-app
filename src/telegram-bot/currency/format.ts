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

function escapeRichMarkdownTableCell(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim()
}

function getSectionColumns(section: CurrencyRateSection): readonly string[] {
  if (section.columns) {
    return section.columns
  }

  return section.rows.some((row) => row.change)
    ? ['Актив', 'Цена / 24ч']
    : ['Актив', 'Значение']
}

function getRowCells(row: CurrencyRateRow, columnCount: number): string[] {
  const value =
    columnCount > 2 && row.change ? `${row.value} (${row.change})` : row.value
  const cells = [row.label, value]

  if (columnCount > 2) {
    cells.push(row.change ?? '')
  }

  return cells
}

function buildRichTable(section: CurrencyRateSection): string[] {
  if (section.error) {
    return [`_${section.error}_`]
  }

  if (section.rows.length === 0) {
    return ['_No data_']
  }

  const columns = getSectionColumns(section)
  const header = `| ${columns.map(escapeRichMarkdownTableCell).join(' | ')} |`
  const separator = `| ${columns
    .map((_, index) => (index === 0 ? ':---' : '---:'))
    .join(' | ')} |`
  const rows = section.rows.map((row) => {
    const cells = getRowCells(row, columns.length)
    return `| ${cells.map(escapeRichMarkdownTableCell).join(' | ')} |`
  })

  return [header, separator, ...rows]
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

export function buildCurrencyRichMarkdown(
  sections: CurrencyRateSection[],
  title = DEFAULT_TITLE,
): string {
  const lines = [`**${title}**`]

  for (const section of sections) {
    lines.push('', `**${buildSectionTitle(section)}**`, '')
    lines.push(...buildRichTable(section))
  }

  return lines.join('\n')
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
    richMarkdown: buildCurrencyRichMarkdown(sections),
  }
}
