import { createRequire } from 'node:module'

interface BraceNode {
  type: string
  nodes?: BraceNode[]
}

const require = createRequire(`${process.cwd()}/package.json`)
const braces = require('braces') as {
  compile(pattern: string): string
  expand(pattern: string, options?: { maxDepth?: number }): string[]
  parse(pattern: string): BraceNode
  stringify(pattern: string): string
}

function nestingDepth(ast: BraceNode): number {
  const pending = [{ node: ast, depth: 0 }]
  let deepest = 0
  for (let item = pending.pop(); item; item = pending.pop()) {
    const depth =
      item.depth + (['brace', 'paren'].includes(item.node.type) ? 1 : 0)
    deepest = Math.max(deepest, depth)
    for (const node of item.node.nodes ?? []) {
      pending.push({ node, depth })
    }
  }
  return deepest
}

describe('patched braces security regression', () => {
  test.each([
    ['{', '}'],
    ['(', ')'],
  ])(
    'bounds deeply nested %s patterns before recursive walkers',
    (open, close) => {
      const pattern = `${open.repeat(4_995)}a,b${close.repeat(4_995)}`
      expect(pattern.length).toBeLessThan(10_000)
      expect(nestingDepth(braces.parse(pattern))).toBeLessThanOrEqual(256)
      expect(typeof braces.compile(pattern)).toBe('string')
      expect(Array.isArray(braces.expand(pattern))).toBe(true)
      expect(braces.stringify(pattern)).toBe(pattern)
    },
  )

  test('keeps normal build glob expansion unchanged', () => {
    expect(
      braces.expand('src/{agent-worker,telegram-bot}/**/*.{ts,tsx}'),
    ).toEqual([
      'src/agent-worker/**/*.ts',
      'src/agent-worker/**/*.tsx',
      'src/telegram-bot/**/*.ts',
      'src/telegram-bot/**/*.tsx',
    ])
    expect(braces.expand('x/{a,{b,c}}/{1..2}')).toEqual([
      'x/a/1',
      'x/a/2',
      'x/b/1',
      'x/b/2',
      'x/c/1',
      'x/c/2',
    ])
  })

  test('cannot raise the parser depth limit', () => {
    const pattern = `${'{'.repeat(4_995)}a,b${'}'.repeat(4_995)}`
    expect(Array.isArray(braces.expand(pattern, { maxDepth: Infinity }))).toBe(
      true,
    )
    expect(braces.expand('{{a,b},c}', { maxDepth: 1 })).toEqual(['{a,b}', 'c'])
    expect(braces.expand('{{a,b},c}', { maxDepth: 2 })).toEqual(['a', 'b', 'c'])
  })
})
