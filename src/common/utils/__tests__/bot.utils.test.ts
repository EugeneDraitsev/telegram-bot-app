import type { Message, Update, UserFromGetMe } from 'grammy/types'
import type { Context } from 'grammy/web'

import { logger } from '../../logger'
import * as history from '../../upstash'
import { createBot } from '../bot.utils'

const botInfo: UserFromGetMe = {
  id: 99,
  is_bot: true,
  first_name: 'Test bot',
  username: 'test_bot',
  can_join_groups: true,
  can_read_all_group_messages: true,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
}
const update = {
  update_id: 1,
  message: {
    message_id: 10,
    date: 1_800_000_000,
    chat: { id: 123, type: 'private', first_name: 'User' },
    from: { id: 123, is_bot: false, first_name: 'User' },
    text: '/s',
    entities: [{ type: 'bot_command', offset: 0, length: 2 }],
  },
} satisfies Update

function sentMessage(fields: Partial<Message> = {}): Message {
  return {
    message_id: 11,
    date: 1_800_000_001,
    chat: update.message.chat,
    from: botInfo,
    ...fields,
  } as Message
}

function createTestBot(result: unknown, ok = true, saveHistory = true) {
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () =>
      Response.json(
        ok
          ? { ok, result }
          : { ok, error_code: 400, description: 'Bad Request: send failed' },
      ),
    )
  const bot = createBot({ saveHistory })
  bot.botInfo = botInfo
  return { bot, fetchMock }
}

describe('bot reply history', () => {
  let saveMessageMock: jest.SpyInstance
  let loggerErrorMock: jest.SpyInstance
  const originalToken = process.env.TOKEN

  beforeEach(() => {
    process.env.TOKEN = 'test-token'
    saveMessageMock = jest
      .spyOn(history, 'saveMessage')
      .mockResolvedValue(undefined)
    loggerErrorMock = jest.spyOn(logger, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    if (originalToken === undefined) delete process.env.TOKEN
    else process.env.TOKEN = originalToken
    jest.spyOn(globalThis, 'fetch').mockRestore()
    saveMessageMock.mockRestore()
    loggerErrorMock.mockRestore()
  })

  test('keeps the /s photo, caption and reply target in agent history', async () => {
    const message = sentMessage({
      caption: '24h chat statistics: https://example.com/chat/123',
      photo: [
        {
          file_id: 'stats-photo',
          file_unique_id: 'stats-photo-unique',
          width: 400,
          height: 200,
        },
      ],
      reply_to_message: { ...update.message, reply_to_message: undefined },
    })
    const { bot } = createTestBot(message)
    bot.command('s', async (ctx) => {
      await ctx.replyWithPhoto('stats-photo', {
        caption: message.caption,
        reply_parameters: { message_id: ctx.msg.message_id },
      })
    })

    await bot.handleUpdate(update)

    expect(saveMessageMock).toHaveBeenCalledTimes(1)
    expect(saveMessageMock).toHaveBeenCalledWith(message, 123)
    const saved = saveMessageMock.mock.calls[0][0] as Message
    expect(history.formatHistoryForDisplay([saved])).toContain(
      'Bot: 24h chat statistics: https://example.com/chat/123 [media: photo]',
    )
  })

  test.each<[string, (ctx: Context) => Promise<unknown>, Partial<Message>?]>([
    ['text reply', (ctx) => ctx.reply('hello')],
    ['direct API send', (ctx) => ctx.api.sendMessage(123, 'hello')],
    [
      'rich reply',
      (ctx) => ctx.api.sendRichMessage(123, { markdown: 'hello' }),
      {
        rich_message: { blocks: [{ type: 'paragraph', text: 'hello' }] },
      } as Partial<Message>,
    ],
    [
      'video reply',
      (ctx) => ctx.replyWithVideo('video-file'),
      {
        caption: 'video caption',
        video: {
          file_id: 'video-file',
          file_unique_id: 'video',
          width: 100,
          height: 100,
          duration: 5,
        },
      },
    ],
    [
      'audio reply',
      (ctx) => ctx.replyWithAudio('audio-file'),
      {
        audio: {
          file_id: 'audio-file',
          file_unique_id: 'audio',
          duration: 5,
          title: 'Generated music',
        },
      },
    ],
    [
      'animation reply',
      (ctx) => ctx.replyWithAnimation('animation-file'),
      {
        animation: {
          file_id: 'animation-file',
          file_unique_id: 'animation',
          width: 100,
          height: 100,
          duration: 5,
        },
      },
    ],
    [
      'video note reply',
      (ctx) => ctx.replyWithVideoNote('video-note-file'),
      {
        video_note: {
          file_id: 'video-note-file',
          file_unique_id: 'video-note',
          length: 100,
          duration: 5,
        },
      },
    ],
    [
      'document reply',
      (ctx) => ctx.replyWithDocument('document-file'),
      {
        caption: 'file caption',
        document: {
          file_id: 'document-file',
          file_unique_id: 'document',
          file_name: 'result.png',
          mime_type: 'image/png',
        },
      },
    ],
    [
      'voice reply',
      (ctx) => ctx.replyWithVoice('voice-file'),
      {
        voice: { file_id: 'voice-file', file_unique_id: 'voice', duration: 5 },
      },
    ],
    [
      'sticker reply',
      (ctx) => ctx.replyWithSticker('sticker-file'),
      {
        sticker: {
          file_id: 'sticker-file',
          file_unique_id: 'sticker',
          type: 'regular',
          width: 100,
          height: 100,
          is_animated: false,
          is_video: false,
        },
      },
    ],
    [
      'dice reply',
      (ctx) => ctx.replyWithDice('🎲'),
      { dice: { emoji: '🎲', value: 6 } },
    ],
    ['forwarded reply', (ctx) => ctx.api.forwardMessage(123, 456, 10)],
  ])('saves a %s exactly once per update', async (_label, send, fields) => {
    const message = sentMessage(fields ?? { text: 'hello' })
    const { bot } = createTestBot(message)
    bot.on('message', async (ctx) => {
      expect(await send(ctx)).toEqual(message)
    })

    await bot.handleUpdate(update)
    await bot.handleUpdate({ ...update, update_id: 2 })

    expect(saveMessageMock).toHaveBeenCalledTimes(2)
    expect(saveMessageMock).toHaveBeenNthCalledWith(1, message, 123)
    expect(saveMessageMock).toHaveBeenNthCalledWith(2, message, 123)
  })

  test('saves every message in a media group', async () => {
    const messages = [
      sentMessage({ caption: 'first', media_group_id: 'album' }),
      sentMessage({ message_id: 12, media_group_id: 'album' }),
    ]
    const { bot } = createTestBot(messages)
    bot.on('message', async (ctx) => {
      expect(
        await ctx.replyWithMediaGroup([
          { type: 'photo', media: 'photo-1', caption: 'first' },
          { type: 'photo', media: 'photo-2' },
        ]),
      ).toEqual(messages)
    })

    await bot.handleUpdate(update)

    expect(saveMessageMock).toHaveBeenCalledTimes(2)
    expect(saveMessageMock).toHaveBeenCalledWith(messages[0], 123)
    expect(saveMessageMock).toHaveBeenCalledWith(messages[1], 123)
  })

  test('saves sends without an update, including scheduler and agent notices', async () => {
    const message = sentMessage({ caption: 'scheduled rates' })
    const { bot, fetchMock } = createTestBot(message)
    await expect(bot.api.sendPhoto(123, 'rates-photo')).resolves.toEqual(
      message,
    )

    const failureNotice = sentMessage({
      message_id: 12,
      text: 'Try again later',
    })
    fetchMock.mockResolvedValueOnce(
      Response.json({ ok: true, result: failureNotice }),
    )
    await bot.api.sendMessage(123, 'Try again later')

    expect(saveMessageMock).toHaveBeenCalledTimes(2)
    expect(saveMessageMock).toHaveBeenCalledWith(message, 123)
    expect(saveMessageMock).toHaveBeenCalledWith(failureNotice, 123)
  })

  test('preserves the complete Telegram text and metadata without cleaning', async () => {
    const text = `USER: 42 (example): literal text <b>kept</b> ${'long '.repeat(100)}`
    const message = sentMessage({
      text,
      entities: [{ type: 'bold', offset: 0, length: 4 }],
    })
    const { bot } = createTestBot(message)

    await expect(bot.api.sendMessage(123, text)).resolves.toEqual(message)

    expect(saveMessageMock).toHaveBeenCalledWith(message, 123)
  })

  test('ingress does not persist history', async () => {
    const { bot } = createTestBot(sentMessage({ text: 'hello' }), true, false)
    bot.on('message', (ctx) => ctx.reply('hello'))

    await bot.handleUpdate(update)

    expect(saveMessageMock).not.toHaveBeenCalled()
  })

  test('does not save unsuccessful sends', async () => {
    const { bot } = createTestBot(undefined, false)
    bot.on('message', (ctx) => ctx.replyWithPhoto('photo-file'))

    await expect(bot.handleUpdate(update)).rejects.toThrow('send failed')

    expect(saveMessageMock).not.toHaveBeenCalled()
  })

  test('ignores typing acknowledgements and message edits', async () => {
    const { bot, fetchMock } = createTestBot(true)
    fetchMock.mockResolvedValueOnce(
      Response.json({ ok: true, result: sentMessage({ text: 'edited' }) }),
    )
    bot.on('message', async (ctx) => {
      await ctx.api.editMessageText(123, 11, 'edited')
      await ctx.replyWithChatAction('typing')
    })

    await bot.handleUpdate(update)

    expect(saveMessageMock).not.toHaveBeenCalled()
  })

  test('logs history failure without retrying an already delivered reply', async () => {
    const error = new Error('Redis unavailable')
    saveMessageMock.mockRejectedValueOnce(error)
    const message = sentMessage({ caption: 'stats' })
    const { bot, fetchMock } = createTestBot(message)
    bot.on('message', async (ctx) => {
      expect(await ctx.replyWithPhoto('photo-file')).toEqual(message)
    })

    await bot.handleUpdate(update)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { err: error },
      'saveHistory error',
    )
  })
})
