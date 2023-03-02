import { yasnyfy } from '../yasno'

describe('yasnyfy should works as designed', () => {
  test('yasnyfy should properly work with hardcoded values', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(2018, 10, 10))

    expect(yasnyfy('тест')).toEqual('\n\\>20!8\n\\>тест\nЯсно')
    expect(yasnyfy('')).toEqual('\n\\>20!8\nЯсно')
  })

  test('yasnyfy should properly work with ordinary values', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(2017, 10, 10))

    expect(yasnyfy('тест')).toEqual('\n\\>2k17\n\\>тест\nЯсно')
    expect(yasnyfy('')).toEqual('\n\\>2k17\nЯсно')

    jest.setSystemTime(new Date(2019, 10, 10))
    expect(yasnyfy('тест')).toEqual('\n\\>2k19\n\\>тест\nЯсно')
    expect(yasnyfy('')).toEqual('\n\\>2k19\nЯсно')

    jest.setSystemTime(new Date(2021, 10, 10))
    expect(yasnyfy('тест')).toEqual('\n\\>2️⃣0️⃣2️⃣1️⃣\n\\>тест\nЯсно')
    expect(yasnyfy('')).toEqual('\n\\>2️⃣0️⃣2️⃣1️⃣\nЯсно')

    jest.setSystemTime(new Date(2022, 10, 10))
    const result = yasnyfy('тест')
    expect(result.includes('² ⁰ ² ²') || result.includes('２０２２')).toBeTruthy()

    jest.setSystemTime(new Date(2023, 10, 10))
    const result2023 = yasnyfy('тест')
    expect(
      result2023.includes('||202 :3||') ||
        result2023.includes('||2023||') ||
        result2023.includes('||MMXXIII||'),
    ).toBeTruthy()
  })

  test('yasnyfy should properly work with warhammer values', () => {
    jest.setSystemTime(new Date(2020, 10, 10))
    expect(yasnyfy('тест').slice(7)).toEqual('9 020.M3\n\\>тест\nЯсно')
    expect(yasnyfy('').slice(7)).toEqual('9 020.M3\nЯсно')
  })

  test('yasnyfy should fallback to default value', () => {
    jest.setSystemTime(new Date(2016, 10, 10))
    expect(yasnyfy('тест')).toEqual('\n\\>2016\n\\>тест\nЯсно')
    expect(yasnyfy('')).toEqual('\n\\>2016\nЯсно')
  })

  test('yasnyfy should properly work at 1st of april', () => {
    jest.setSystemTime(new Date(2019, 3, 1, 16, 0))

    expect(yasnyfy('тест')).toEqual('\n\\>1 Апреля 19 года\n\\>тест\nЯсно😐')
    expect(yasnyfy('')).toEqual('\n\\>1 Апреля 19 года\nЯсно😐')
  })
})
