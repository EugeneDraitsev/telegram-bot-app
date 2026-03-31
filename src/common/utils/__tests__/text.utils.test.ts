import { dedent, hasRussiansLetters, normalize, unEscape } from '..'

describe('hasRussiansLetters', () => {
  test('can check is provided text on russian or not', () => {
    expect(hasRussiansLetters('да, тут есть русские буквы')).toEqual(true)
    expect(
      hasRussiansLetters(
        '  а тут есть русские буквы, да ещё и целый пробел!  ',
      ),
    ).toEqual(true)
    expect(hasRussiansLetters('no, there are no russian letters here')).toEqual(
      false,
    )
  })
})

describe('dedent', () => {
  test('removes unnecessary spaces after \\n', () => {
    expect(dedent`\n   some redundant\n   spaces here`).toEqual(
      '\nsome redundant\nspaces here',
    )
    expect(dedent('\n   some redundant\n   spaces here')).toEqual(
      '\nsome redundant\nspaces here',
    )
    expect(
      dedent(dedent`Users Statistic:
            All messages: ${String(123123)}`),
    ).toEqual('Users Statistic:\nAll messages: 123123')
  })
})

describe('normalize', () => {
  test('fixes spacings of strings', () => {
    expect(normalize('  some redundant  spaces here')).toEqual(
      'some redundant spaces here',
    )
  })
})

describe('unEscape', () => {
  test('should unescape html', () => {
    expect(unEscape('&lt;div&gt;')).toEqual('<div>')
    expect(unEscape('&#39;&#39;&#39;')).toEqual("'''")
  })
})
