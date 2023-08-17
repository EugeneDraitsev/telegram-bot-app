import lodash from 'lodash'

import { throwDice } from '../dice'

lodash.random = jest.fn(() => 1)

describe('throwDice should works as designed', () => {
  test('throwDice should return correct dices', () => {
    expect(throwDice(6)).toEqual(`<pre>
  ___
/     \\
| 001 |
\\     /
  ¯¯¯</pre>`)
  })
})
