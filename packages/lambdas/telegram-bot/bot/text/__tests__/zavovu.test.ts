import { zavovu } from '..'

describe('zavovu should work correctly', () => {
  test('zavovu should reply default answer for empty input', () => {
    expect(zavovu()).toEqual('VoVa обоcралZя')
  })
  test('zavovu should convert lower case letters correctly', () => {
    expect(zavovu('зв')).toEqual('ZV')
  })
  test('zavovu should convert upper case letters correctly', () => {
    expect(zavovu('ЗВ')).toEqual('ZV')
  })
  test('zavovu should convert letters of mixed case correctly', () => {
    expect(zavovu('зв ВЗ')).toEqual('ZV VZ')
  })
  test('zavovu should provide one of the default answers if string is non-convertable', () => {
    const result = sayThanksForLink()
    expect(ANSWERS.includes(result)).toEqual(true)
  })
})
