import { Settings } from 'luxon'

import { yasnyfy } from '..'

describe('yasnyfy should works as designed', () => {
  test('yasnyfy should properly work with hardcoded values', () => {
    Settings.now = (): number => new Date(2018, 10, 10).valueOf()

    expect(yasnyfy('тест')).toEqual('\n>20!8\n>тест\nЯсно')
    expect(yasnyfy('')).toEqual('\n>20!8\nЯсно')
  })

  test('yasnyfy should properly work with ordinary values', () => {
    Settings.now = (): number => new Date(2017, 10, 10).valueOf()
    expect(yasnyfy('тест')).toEqual('\n>2k17\n>тест\nЯсно')
    expect(yasnyfy('')).toEqual('\n>2k17\nЯсно')

    Settings.now = (): number => new Date(2019, 10, 10).valueOf()
    expect(yasnyfy('тест')).toEqual('\n>2k19\n>тест\nЯсно')
    expect(yasnyfy('')).toEqual('\n>2k19\nЯсно')

    Settings.now = (): number => new Date(2021, 10, 10).valueOf()
    expect(yasnyfy('тест')).toEqual('\n>2021\n>тест\nЯсно')
    expect(yasnyfy('')).toEqual('\n>2021\nЯсно')
  })

  test('yasnyfy should properly work with warhammer values', () => {
    Settings.now = (): number => new Date(2020, 10, 10).valueOf()
    expect(yasnyfy('тест').slice(7)).toEqual(' 020.M3\n>тест\nЯсно')
    expect(yasnyfy('').slice(7)).toEqual(' 020.M3\nЯсно')
  })

  test('yasnyfy should fallback to default value', () => {
    Settings.now = (): number => new Date(2016, 10, 10).valueOf()
    expect(yasnyfy('тест')).toEqual('\n>2016\n>тест\nЯсно')
    expect(yasnyfy('')).toEqual('\n>2016\nЯсно')
  })

  test('yasnyfy should properly work at 1st of april', () => {
    Settings.now = (): number => new Date(2019, 3, 1, 16, 0).valueOf()

    expect(yasnyfy('тест')).toEqual('\n>1 Апреля 19 года\n>тест\nЯсно😐')
    expect(yasnyfy('')).toEqual('\n>1 Апреля 19 года\nЯсно😐')
  })
})
