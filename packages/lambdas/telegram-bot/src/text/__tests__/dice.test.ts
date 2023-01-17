import lodash from 'lodash'

import { throwDice } from '..'

lodash.random = jest.fn(() => 1)

describe('throwDice should works as designed', () => {
  test('throwDice should return correct dices', () => {
    // lodash.random = jest.fn(() => 1)
    expect(throwDice(6)).toEqual(`<pre>
  ___
/     \\
| 001 |
\\     /
  ¯¯¯</pre>`)
  })
})
