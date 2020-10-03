import { Chat, MessageEntity, User } from 'telegram-typings'

import {
  findCommand,
  isLink,
  parseMessage,
  checkCommand,
  isBotCommand,
  getUserName,
  getChatName,
} from '..'

describe('findCommand must works as designed', () => {
  test('findCommand must properly commands from first word in message or string ending with @', () => {
    expect(findCommand('/g')).toEqual('/g')
    expect(findCommand('/hello world')).toEqual('/hello')
    expect(findCommand('/g@draiBot')).toEqual('/g')
    expect(findCommand('g')).toEqual('g')
    expect(findCommand(undefined)).toEqual('')
    expect(findCommand('/t multi \n\n\r line')).toEqual('/t')
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
    expect(parseMessage(undefined)).toEqual(['', ''])
  })
})

describe('isYaMusicLink works correctly', () => {
  test('isYaMusicLink finds link in a message which contains only link', () => {
    expect(isLink('https://music.yandex.by/')).toBeTruthy()
  })
  test('isYaMusicLink finds no link in an empty message', () => {
    expect(isLink('')).toBeFalsy()
    expect(isLink(undefined)).toBeFalsy()
  })
  test('isYaMusicLink finds link in a message with text and link', () => {
    expect(isLink('https://music.yandex.by/ masdasd aasdl;kqw ASqwead.')).toBeTruthy()
  })
})

describe('checkCommand', () => {
  test('should returns function that properly identifies command', () => {
    expect(checkCommand('/g')('/g blbalba')).toEqual(true)
    expect(checkCommand('/test')('/g blbalba')).toEqual(false)
    expect(checkCommand('/test')(undefined)).toEqual(false)
  })
})

describe('isBotCommand', () => {
  test('checks that provided message contains bot command', () => {
    expect(isBotCommand([{ type: 'bot_command' }] as MessageEntity[])).toEqual(true)
    expect(isBotCommand([])).toEqual(false)
    expect(isBotCommand()).toEqual(false)
  })
})

describe('getUserName', () => {
  it('should return correct user name, if it exists', () => {
    expect(getUserName({ first_name: 'User', last_name: 'Name' } as User)).toEqual('User Name')
    expect(getUserName({ username: 'UserName' } as Chat)).toEqual('UserName')
  })
  it('should return "Unknown Chat" if name doesn\'t exist', () => {
    expect(getChatName({} as Chat)).toEqual('Unknown Chat')
  })
})
