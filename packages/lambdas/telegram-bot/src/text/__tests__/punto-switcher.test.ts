import { puntoSwitcher } from '../punto-switcher'

describe('puntoSwitcher', () => {
  test('should fix wrong types words (en -> rus)', () => {
    expect(puntoSwitcher('ghbdtn')).toEqual('привет')
    expect(puntoSwitcher('')).toEqual('')
  })
  test('should fix wrong types words (rus -> en', () => {
    expect(puntoSwitcher('руддщ еруку')).toEqual('hello there')
    expect(puntoSwitcher('ghbdtnbrb dctv')).toEqual('приветики всем')
  })
})
