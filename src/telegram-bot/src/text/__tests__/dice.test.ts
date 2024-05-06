import { throwDice } from '../dice'

describe('throwDice should works as designed', () => {
  test('throwDice should return correct dices', () => {
    expect(throwDice(6, () => 1)).toEqual(`<pre>
  ___
/     \\
| 001 |
\\     /
  ¯¯¯</pre>`)
  })
})
