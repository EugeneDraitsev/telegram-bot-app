export const hasRussiansLetters = (text: string) => text.match && text.match(/^[А-Яа-яёЁ]+/)

export const dedent = (callSite: any, ...args: any[]): string => {
  const format = (str: string) => {
    let size = -1
    return str.replace(/\n(\s+)/g, (m, m1) => {
      if (size < 0) {
        size = m1.replace(/\t/g, '    ').length
      }
      return `\n${m1.slice(Math.min(m1.length, size))}`
    })
  }

  if (typeof callSite === 'string') {
    return format(callSite)
  }

  if (typeof callSite === 'function') {
    return String((...values: any[]) => format(callSite(...values)))
  }

  const output = callSite
    .slice(0, args.length + 1)
    .map((text: string, i: number) => (i === 0 ? '' : args[i - 1]) + text)
    .join('')

  return format(output)
}

export const normalize = (str: string) => str
  .replace(/<(.|\n)*?>/g, '')
  .replace(/\s\s+/g, ' ')
  .replace('\n', ' ')
  .trim()
