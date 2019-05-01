import { findCommand, isYaMusicLink, parseMessage } from '..'

describe('findCommand must works as designed', () => {
  test('findCommand must properly commands from first word in message or string ending with @', () => {
    expect(findCommand('/g')).toEqual('/g')
    expect(findCommand('/hello world')).toEqual('/hello')
    expect(findCommand('/g@draiBot')).toEqual('/g')
    expect(findCommand('g')).toEqual('g')
  })
})

describe('parseMessage should works as designed', () => {
  test('parseMessage should correct handle empty commands', () => {
    expect(parseMessage('/g')).toEqual(['/g', ''])
    expect(parseMessage('')).toEqual(['', ''])
    expect(parseMessage('/g@draiBot')).toEqual(['/g', ''])
  })
  test('parseMessage should properly parse different types of commands', () => {
    expect(parseMessage('/hello world')).toEqual(['/hello', 'world'])
    expect(parseMessage('/g cats')).toEqual(['/g', 'cats'])
    expect(parseMessage('/g@draiBot cats')).toEqual(['/g', 'cats'])
    expect(parseMessage('/g@draiBot testing is cool')).toEqual(['/g', 'testing is cool'])
    expect(parseMessage('/p multi / slashes /')).toEqual(['/p', 'multi / slashes /'])
  })
})

describe('isYaMusicLink works correctly', () => {
  test('isYaMusicLink finds link in a message which contains only link', () => {
    expect(isYaMusicLink('https://music.yandex.by/')).toBeTruthy()
  })
  test('isYaMusicLink finds no link in an empty message', () => {
    expect(isYaMusicLink('')).toBeFalsy()
    expect(isYaMusicLink(undefined)).toBeFalsy()
  })
  test('isYaMusicLink finds link in a message with text and link', () => {
    expect(isYaMusicLink('https://music.yandex.by/ masdasd aasdl;kqw ASqwead.')).toBeTruthy()
  })
})
