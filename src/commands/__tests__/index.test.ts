import { findCommand } from '../'

describe('findCommand must works as designed', () => {
  test('findCommand must properly commands from first word in message or string ending with @', () => {
    expect(findCommand('/g')).toEqual('/g')
    expect(findCommand('/hello world')).toBeUndefined()
    expect(findCommand('/g@draiBot')).toEqual('/g')
    expect(findCommand('g')).toBeUndefined()
  })
})
