import type { Chat, Message, MessageEntity, User } from 'telegram-typings'

import {
  checkCommand,
  findCommand,
  getChatName,
  getCommandData,
  getParsedText,
  getUserName,
  isBotCommand,
  isLink,
} from '..'

describe('findCommand', () => {
  test('must properly commands from first word in message or string ending with @', () => {
    expect(findCommand('/g')).toEqual('/g')
    expect(findCommand('/hello world')).toEqual('/hello')
    expect(findCommand('/g@draiBot')).toEqual('/g')
    expect(findCommand('g')).toEqual('g')
    expect(findCommand(undefined)).toEqual('')
    expect(findCommand('/t multi \n\n\r line')).toEqual('/t')
  })
})

describe('getParsedText', () => {
  test('should correct handle empty commands without text', () => {
    expect(getParsedText('/g')).toEqual('')
    expect(getParsedText('')).toEqual('')
    expect(getParsedText('/g@draiBot')).toEqual('')
  })
  test('should correct handle text without command', () => {
    expect(getParsedText('hello world')).toEqual('hello world')
  })
  test('should properly parse different types of commands', () => {
    expect(getParsedText('/hello world')).toEqual('world')
    expect(getParsedText('/g cats')).toEqual('cats')
    expect(getParsedText('/g@draiBot cats')).toEqual('cats')
    expect(getParsedText('/g@draiBot testing is cool')).toEqual(
      'testing is cool',
    )
    expect(getParsedText('/p multi / slashes /')).toEqual('multi / slashes /')
    expect(getParsedText(undefined)).toEqual('')
  })
})

describe('isLink', () => {
  test('finds link in a message which contains only link', () => {
    expect(isLink('https://music.yandex.by/')).toBeTruthy()
  })
  test('finds no link in an empty message', () => {
    expect(isLink('')).toBeFalsy()
    expect(isLink(undefined)).toBeFalsy()
  })
  test('finds link in a message with text and link', () => {
    expect(
      isLink('https://music.yandex.by/ masdasd aasdl;kqw ASqwead.'),
    ).toBeTruthy()
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
    expect(isBotCommand([{ type: 'bot_command' }] as MessageEntity[])).toEqual(
      true,
    )
    expect(isBotCommand([])).toEqual(false)
    expect(isBotCommand()).toEqual(false)
  })
})

describe('getUserName', () => {
  it('should return correct user name, if it exists', () => {
    expect(
      getUserName({ first_name: 'User', last_name: 'Name' } as User),
    ).toEqual('User Name')
    expect(getUserName({ username: 'UserName' } as User)).toEqual('UserName')
    expect(getUserName({ id: 123 } as User)).toEqual('123')
  })
  it('should return "Unknown Chat" if name doesn\'t exist', () => {
    expect(getUserName()).toEqual('Unknown Chat')
  })
})

describe('getChatName', () => {
  it('should return correct user name, if it exists', () => {
    expect(getChatName({ title: 'ChatTitle' } as Chat)).toEqual('ChatTitle')
  })
  it('should return "Unknown Chat" if name doesn\'t exist', () => {
    expect(getChatName()).toEqual('Unknown Chat')
  })
})

describe('getCommandData', () => {
  it('return correct text and replyId', () => {
    expect(
      getCommandData({
        text: '/s',
        reply_to_message: { message_id: 123 },
      } as Message),
    ).toEqual({ text: '', replyId: 123, combinedText: '', images: [] })
    expect(getCommandData({ text: '/z', message_id: 555 } as Message)).toEqual({
      text: '',
      replyId: 555,
      combinedText: '',
      images: [],
    })
    expect(
      getCommandData({
        text: '/g cat',
        message_id: 555,
        reply_to_message: { message_id: 123 },
      } as Message),
    ).toEqual({ text: 'cat', replyId: 555, combinedText: 'cat', images: [] })
    expect(
      getCommandData({
        message_id: 555,
        reply_to_message: { message_id: 123, text: '/g cat' },
      } as Message),
    ).toEqual({
      text: '/g cat',
      replyId: 123,
      combinedText: '/g cat',
      images: [],
    })
  })
  it('should return caption if text is empty', () => {
    expect(getCommandData({ text: '', caption: '123123' } as Message)).toEqual({
      text: '123123',
      combinedText: '123123',
      images: [],
    })
  })
  it('should return correct combinedText', () => {
    expect(
      getCommandData({
        text: '111',
        caption: '222',
        reply_to_message: { message_id: 123, text: '333', caption: '444' },
      } as Message),
    ).toEqual({
      text: '111',
      combinedText: '333\n111',
      images: [],
    })
  })
})
