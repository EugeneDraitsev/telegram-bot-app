import { DateTime } from 'luxon'

import { yasnyfy } from '../'

describe('yasnyfy should works as designed', () => {
  const { month, day } = DateTime.local().setZone('Europe/Minsk').toObject()

  test('yasnyfy should properly work with hardcoded values', () => {
    if (month !== 4 || day !== 1) {
      expect(yasnyfy('тест', '2018')).toEqual('\n>20!8\n>тест\nЯсно')
      expect(yasnyfy('', '2018')).toEqual('\n>20!8\nЯсно')
    }
  })
  test('yasnyfy should properly work with ordinary values', () => {
    if (month !== 4 || day !== 1) {
      expect(yasnyfy('тест', '2019')).toEqual('\n>2k19\n>тест\nЯсно')
      expect(yasnyfy('тест', '3019')).toEqual('\n>3k19\n>тест\nЯсно')
      expect(yasnyfy('', '3019')).toEqual('\n>3k19\nЯсно')
    }
  })
})
