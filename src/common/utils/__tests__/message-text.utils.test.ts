import type { Message } from 'grammy/types'

import { getMessageText } from '../message-text.utils'

const asMessage = (message: unknown) => message as Message

describe('getMessageText', () => {
  test('prefers plain text and caption', () => {
    expect(getMessageText(asMessage({ text: 'hello' }))).toBe('hello')
    expect(getMessageText(asMessage({ caption: 'photo caption' }))).toBe(
      'photo caption',
    )
  })

  test('returns an empty string for missing or textless messages', () => {
    expect(getMessageText(undefined)).toBe('')
    expect(getMessageText(asMessage({ sticker: { file_id: 'x' } }))).toBe('')
  })

  test('flattens rich message paragraphs with inline entities', () => {
    const message = asMessage({
      rich_message: {
        blocks: [
          { type: 'paragraph', text: 'Безопасный маршрут:' },
          {
            type: 'paragraph',
            text: { type: 'bold', text: 'Жлобин → Иерусалим.' },
          },
          {
            type: 'paragraph',
            text: [
              'Но есть ',
              { type: 'bold', text: ['нюанс', { type: 'italic', text: '!' }] },
              ' с визами.',
            ],
          },
        ],
      },
    })

    expect(getMessageText(message)).toBe(
      'Безопасный маршрут:\nЖлобин → Иерусалим.\nНо есть нюанс! с визами.',
    )
  })

  test('flattens nested blocks, lists, tables and captions', () => {
    const message = asMessage({
      rich_message: {
        blocks: [
          { type: 'heading', text: 'Отчёт', size: 2 },
          { type: 'divider' },
          {
            type: 'list',
            items: [
              { label: '1.', blocks: [{ type: 'paragraph', text: 'первый' }] },
              { label: '2.', blocks: [{ type: 'paragraph', text: 'второй' }] },
            ],
          },
          {
            type: 'blockquote',
            blocks: [{ type: 'paragraph', text: 'цитата' }],
          },
          {
            type: 'table',
            cells: [[{ text: 'Speed' }, { text: '42' }]],
            caption: 'Метрики',
          },
          { type: 'mathematical_expression', expression: 'E = mc^2' },
          { type: 'photo', photo: [], caption: { text: 'подпись' } },
          {
            type: 'paragraph',
            text: {
              type: 'custom_emoji',
              custom_emoji_id: '1',
              alternative_text: '👍',
            },
          },
        ],
      },
    })

    expect(getMessageText(message)).toBe(
      'Отчёт\nпервый\nвторой\nцитата\nSpeed\n42\nМетрики\nE = mc^2\nподпись\n👍',
    )
  })
})
