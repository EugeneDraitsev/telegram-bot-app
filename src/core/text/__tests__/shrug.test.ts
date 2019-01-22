import { shrugyfy } from '../'

describe('shrugyfy should works as designed', () => {
  test('shrugyfy should properly work without any values', () => {

    expect(shrugyfy()).toEqual(`¯\_(ツ)_/¯`)
  })
})
