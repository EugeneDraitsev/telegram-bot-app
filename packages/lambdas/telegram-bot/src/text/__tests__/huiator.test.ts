import { huify } from '../huiator'

describe('huiator must works as designed', () => {
  test('huiator must properly huify russian words (length > 2)', () => {
    expect(huify('кот')).toEqual('хует')
    expect(huify('яблоко')).toEqual('хуяблоко')
    expect(huify('несколько слов')).toEqual('хуесколько хуев')
    expect(huify('кит')).toEqual('хуит')
    expect(huify('а')).toEqual('а')
    expect(huify('даунил на саппорте')).toEqual('хуяунил на хуяппорте')
  })
  test('huiator must returns original word on english or unconvertible russian words', () => {
    expect(huify('test')).toEqual('test')
    expect(huify('ккккккккккккккккккк')).toEqual('ккккккккккккккккккк')
    expect(huify('')).toEqual('')
  })
  test('huiator must save Capitalization letters', () => {
    expect(huify('Журавлева')).toEqual('Хуюравлева')
    expect(huify('Кабанова')).toEqual('Хуябанова')
    expect(huify('СлОжнЫйКейс')).toEqual('ХуЕжнЫйКейс')
  })
})
