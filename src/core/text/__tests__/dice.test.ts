import { throwDice } from '..'

const lodash = require.requireActual('lodash')

describe('throwDice should works as designed', () => {
  test('throwDice should return correct dices', () => {
    lodash.random = jest.fn(() => 1)
    expect(throwDice(6)).toEqual(`\`\`\`
  ___
/     \\
| 001 |
\\     /
  ¯¯¯\`\`\``)
  })
})
