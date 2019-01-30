import { findCommand, parseQuery, isYaMusicLink } from '../'

describe('findCommand must works as designed', () => {
  test('findCommand must properly commands from first word in message or string ending with @', () => {
    expect(findCommand('/g')).toEqual('/g')
    expect(findCommand('/hello world')).toBeUndefined()
    expect(findCommand('/g@draiBot')).toEqual('/g')
    expect(findCommand('g')).toBeUndefined()
  })
})

describe('parseQuery should works as designed', () => {
  test('parseQuery should correct handle empty commands', () => {
    expect(parseQuery('/g')).toEqual('')
    expect(parseQuery('')).toEqual('')
    expect(parseQuery('/g@draiBot')).toEqual('')
  })
  test('parseQuery should properly parse different types of commands', () => {
    expect(parseQuery('/hello world')).toEqual('world')
    expect(parseQuery('/g cats')).toEqual('cats')
    expect(parseQuery('/g@draiBot cat')).toEqual('cat')
    expect(parseQuery('/g@draiBot testing is cool')).toEqual('testing is cool')
  })
})

describe('isYaMusicLink works correctly', () => {
  test('isYaMusicLink finds link in a message which contains only link', () => {
    expect(isYaMusicLink('https://music.yandex.by/')).toBeTruthy()
  })
  test('isYaMusicLink finds no link in an empty message', () => {
    expect(isYaMusicLink('')).toBeFalsy()
  })
  test('isYaMusicLink finds link in a message with text and link', () => {
    expect(isYaMusicLink('https://music.yandex.by/ masdasd aasdl;kqw ASqwead.')).toBeTruthy()
  })
})
