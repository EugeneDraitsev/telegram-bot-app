'use strict'
var huiator = require('./huiator.js')

describe('huiator must works as designed', () => {
  test('huiator must properly huify russian words', () => {
    expect(huiator.huify('кот')).toEqual('хует')
    expect(huiator.huify('яблоко')).toEqual('хуяблоко')
    expect(huiator.huify('несколько слов')).toEqual('хуесколько хуев')
    expect(huiator.huify('а')).toEqual('хуя')
  })
  test('huiator must returns original word on english or unconvertible russian words', () => {
    expect(huiator.huify('test')).toEqual('test')
    expect(huiator.huify('ккккккккккккккккккк')).toEqual('ккккккккккккккккккк')
  })
})