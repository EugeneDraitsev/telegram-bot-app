import { safeJSONParse } from '..'

describe('safeJSONParse', () => {
  it('should return null if the string is not a valid JSON', () => {
    expect(safeJSONParse('{')).toBeNull()
    expect(safeJSONParse(undefined)).toBeNull()
  })

  it('should return the parsed JSON if the string is a valid JSON', () => {
    expect(safeJSONParse('{"a": 1}')).toEqual({ a: 1 })
  })
})
