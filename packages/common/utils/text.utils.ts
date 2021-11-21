const punctuationRegex = /[.,/#!$%^&*;:{}=\-_`~<>[\]()]/g

export const hasRussiansLetters = (text: string) =>
  Boolean(
    text
      .trim()
      .replace(punctuationRegex, '')
      .match(/^[А-Яа-яёЁ]+/),
  )

type DedentInput = string | TemplateStringsArray

export const dedent = (callSite: DedentInput, ...args: string[]) => {
  const format = (str: string): string => {
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

  const output = callSite
    .slice(0, args.length + 1)
    .map((text: string, i: number) => (i === 0 ? '' : args[i - 1]) + text)
    .join('')

  return format(output)
}

export const normalize = (str: string) =>
  str // lgtm[js/incomplete-multi-character-sanitization] lgtm[js/polynomial-redos]
    .replace(/<(.|\n)*?>/g, '')
    .replace(/\s\s+/g, ' ')
    .trim()

export const sanitizeSvg = (html: string) => html.replace(/<(div|\/div)[^>]*>/g, '') // lgtm[js/polynomial-redos]
