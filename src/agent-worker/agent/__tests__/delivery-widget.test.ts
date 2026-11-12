import * as common from '@tg-bot/common'
import type { TelegramApi, WidgetResponse } from '../../types'
import { sendResponses } from '../delivery'

const mockLoggerWarn = jest
  .spyOn(common.logger, 'warn')
  .mockImplementation(() => {})

afterAll(() => mockLoggerWarn.mockRestore())

const widget: WidgetResponse = {
  type: 'widget',
  html: '<!doctype html><p>chart</p>',
  fallbackText: 'Sales: 10, 20, 30',
}

function createApi(sendWidget: jest.Mock) {
  const api = {
    sendRichMessage: jest.fn().mockResolvedValue({ message_id: 8 }),
    sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
    raw: { sendWidget },
  }
  return api as typeof api & TelegramApi
}

describe('sendResponses with a widget', () => {
  test('sends the widget with a short text as its caption', async () => {
    const sendWidget = jest.fn().mockResolvedValue({ message_id: 5 })
    const api = createApi(sendWidget)
    const onDelivered = jest.fn()

    await sendResponses({
      api,
      chatId: 42,
      replyToMessageId: 7,
      onDelivered,
      responses: [{ ...widget, caption: 'Sales by month.' }],
    })

    expect(sendWidget).toHaveBeenCalledWith({
      chat_id: 42,
      html: widget.html,
      caption: common.formatTelegramMarkdownV2('Sales by month.'),
      parse_mode: 'MarkdownV2',
      reply_parameters: { message_id: 7 },
    })
    expect(onDelivered).toHaveBeenCalledTimes(1)
    expect(api.sendRichMessage).not.toHaveBeenCalled()
    expect(api.sendMessage).not.toHaveBeenCalled()
  })

  test('prefers the text the model wrote over the tool caption', async () => {
    const sendWidget = jest.fn().mockResolvedValue({ message_id: 5 })

    await sendResponses({
      api: createApi(sendWidget),
      chatId: 42,
      responses: [
        { ...widget, caption: 'from the tool' },
        { type: 'text', text: 'from the model' },
      ],
    })

    expect(sendWidget).toHaveBeenCalledWith({
      chat_id: 42,
      html: widget.html,
      caption: common.formatTelegramMarkdownV2('from the model'),
      parse_mode: 'MarkdownV2',
    })
  })

  test('sends the widget alone when there is no text', async () => {
    const sendWidget = jest.fn().mockResolvedValue({ message_id: 5 })

    await sendResponses({
      api: createApi(sendWidget),
      chatId: 42,
      responses: [widget],
    })

    expect(sendWidget).toHaveBeenCalledWith({ chat_id: 42, html: widget.html })
  })

  test('delivers every queued widget, with the text on the last one', async () => {
    const sendWidget = jest.fn().mockResolvedValue({ message_id: 5 })
    const second = { ...widget, html: '<!doctype html><p>second</p>' }

    await sendResponses({
      api: createApi(sendWidget),
      chatId: 42,
      responses: [widget, second, { type: 'text', text: 'Two cities' }],
    })

    expect(sendWidget.mock.calls).toEqual([
      [{ chat_id: 42, html: widget.html }],
      [
        {
          chat_id: 42,
          html: second.html,
          caption: common.formatTelegramMarkdownV2('Two cities'),
          parse_mode: 'MarkdownV2',
        },
      ],
    ])
  })

  test('sends a text too long for a caption as a reply to the widget', async () => {
    const sendWidget = jest.fn().mockResolvedValue({ message_id: 5 })
    const api = createApi(sendWidget)
    const longText = 'word '.repeat(300).trim()

    await sendResponses({
      api,
      chatId: 42,
      responses: [widget, { type: 'text', text: longText }],
    })

    expect(sendWidget).toHaveBeenCalledWith({ chat_id: 42, html: widget.html })
    expect(api.sendRichMessage).toHaveBeenCalledWith(
      42,
      { markdown: longText },
      { reply_parameters: { message_id: 5 } },
      undefined,
    )
  })

  test('falls back to the text and the plain version when Telegram rejects the widget', async () => {
    const sendWidget = jest.fn().mockRejectedValue(new Error('too large'))
    const api = createApi(sendWidget)

    await sendResponses({
      api,
      chatId: 42,
      responses: [{ ...widget, caption: 'Sales by month.' }],
    })

    expect(api.sendRichMessage).toHaveBeenCalledWith(
      42,
      { markdown: 'Sales by month.\n\nSales: 10, 20, 30' },
      {},
      undefined,
    )
  })

  test('falls back to the plain version when the raw API is unavailable', async () => {
    const api = createApi(jest.fn())
    api.raw = undefined as never

    await sendResponses({ api, chatId: 42, responses: [widget] })

    expect(api.sendRichMessage).toHaveBeenCalledWith(
      42,
      { markdown: 'Sales: 10, 20, 30' },
      {},
      undefined,
    )
  })
})
