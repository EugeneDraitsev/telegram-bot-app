import { hasRussiansLetters, dedent, normalize } from '..'

describe('hasRussiansLetters', () => {
  test('can check is provided text on russian or not', () => {
    expect(hasRussiansLetters('да, тут есть русские буквы')).toEqual(true)
    expect(hasRussiansLetters('no, there is no russian letters here')).toEqual(false)
  })
})

describe('dedent', () => {
  test('removes unnecessary spaces after \\n', () => {
    expect(dedent`\n   some redundant\n   spaces here`).toEqual('\nsome redundant\nspaces here')
    expect(dedent('\n   some redundant\n   spaces here')).toEqual('\nsome redundant\nspaces here')
    expect(
      dedent(dedent`Users Statistic:
            All messages: ${String(123123)}`),
    ).toEqual('Users Statistic:\nAll messages: 123123')
  })
})

describe('normalize', () => {
  test('fixes spacings of strings', () => {
    expect(normalize('  some redundant  spaces here')).toEqual('some redundant spaces here')
  })
})
