import { yasnyfy } from '../'

describe('yasnyfy should works as designed', () => {
  test('yasnyfy should properly work with hardcoded values', () => {
    expect(yasnyfy('тест', '2018')).toEqual('\n>20!8\n>тест\nЯсно')
    expect(yasnyfy('', '2018')).toEqual('\n>20!8\nЯсно')
  })
  test('yasnyfy should properly work with ordinary values', () => {
    expect(yasnyfy('тест', '2019')).toEqual('\n>2k19\n>тест\nЯсно')
    expect(yasnyfy('тест', '3019')).toEqual('\n>3k19\n>тест\nЯсно')
    expect(yasnyfy('', '3019')).toEqual('\n>3k19\nЯсно')
  })
})
