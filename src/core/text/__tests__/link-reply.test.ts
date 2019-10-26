import { sayThanksForLink, APPRECIATIONS } from '..'

describe('link replies', () => {
  test('sayThanksForLink should return random appreciation from appreciations list', () => {
    const result = sayThanksForLink()
    expect(APPRECIATIONS.includes(result)).toEqual(true)
  })
})
