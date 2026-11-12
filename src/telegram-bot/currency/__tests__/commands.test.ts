import type { Context } from 'grammy/web'

const mockGetCurrencyImage = jest.fn()

jest.mock('../image', () => ({
  getCurrencyImage: mockGetCurrencyImage,
}))

import * as common from '@tg-bot/common'
import {
  SCHEDULED_CURRENCY_MESSAGE_OPTIONS,
  sendCurrencyCommand,
} from '../index'

const respond = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response

/** Answers every source /c reads, live and historical. */
function mockSources() {
  return jest.spyOn(globalThis, 'fetch').mockImplementation((async (
    input: unknown,
  ) => {
    const url = String(input)
    if (url.includes('exchangerate-api')) {
      return respond({
        conversion_rates: {
          USD: 1.1,
          BYN: 3.3,
          SEK: 11,
          PLN: 4.4,
          UAH: 50,
          RUB: 92,
        },
      })
    }
    if (url.includes('okx.com')) {
      return respond({
        data: [{ instId: 'BTC-USDT', last: '73000', open24h: '72000' }],
      })
    }
    if (url.includes('quote.cnbc.com')) {
      return respond({
        FormattedQuoteResult: { FormattedQuote: [{ last: '93.2' }] },
      })
    }
    if (url.includes('ts-api.cnbc.com')) {
      return respond({
        barData: {
          priceBars: [{ close: '92.5', tradeTime: '20200101000000' }],
        },
      })
    }

    return respond({
      eur: { usd: 1.1, byn: 3.3, sek: 11, pln: 4.4, uah: 50, rub: 92 },
    })
  }) as unknown as typeof fetch)
}

function createContext(type: 'private' | 'supergroup') {
  const sendWidget = jest.fn().mockResolvedValue({ message_id: 9 })
  const sendPhoto = jest.fn().mockResolvedValue({ message_id: 2 })
  const ctx = {
    chat: { id: 123, type },
    message: {},
    api: { raw: { sendWidget }, sendPhoto },
  } as unknown as Context

  return { ctx, sendWidget, sendPhoto }
}

describe('currency commands', () => {
  beforeEach(() => {
    mockGetCurrencyImage.mockReset()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test.each([
    ['/cs', SCHEDULED_CURRENCY_MESSAGE_OPTIONS],
    ['/ci', { includeBackgroundImage: true, debugBackground: true }],
  ])(
    '%s skips its paid background outside AI-allowed chats',
    async (_, options) => {
      const allowed = jest
        .spyOn(common, 'isAiAllowedChat')
        .mockResolvedValue(false)
      const fetchSpy = jest.spyOn(globalThis, 'fetch')
      const ctx = { chat: { id: 123 }, message: {}, api: {} } as Context

      await expect(sendCurrencyCommand(ctx, options)).resolves.toBeUndefined()

      expect(allowed).toHaveBeenCalledWith(123)
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(mockGetCurrencyImage).not.toHaveBeenCalled()
    },
  )

  test('/c answers a private chat with the widget instead of the image', async () => {
    mockSources()
    const { ctx, sendWidget, sendPhoto } = createContext('private')

    await expect(sendCurrencyCommand(ctx, { widget: true })).resolves.toEqual({
      message_id: 9,
    })

    expect(sendWidget).toHaveBeenCalledWith({
      chat_id: 123,
      html: expect.stringContaining('Q=[["USD/BYN","",2,3,[3,3,'),
    })
    expect(mockGetCurrencyImage).not.toHaveBeenCalled()
    expect(sendPhoto).not.toHaveBeenCalled()
  })

  test('/c keeps the image in a group and does not read the history', async () => {
    const fetchSpy = mockSources()
    mockGetCurrencyImage.mockResolvedValue(Buffer.from('png'))
    const { ctx, sendWidget, sendPhoto } = createContext('supergroup')

    await sendCurrencyCommand(ctx, { widget: true })

    expect(sendWidget).not.toHaveBeenCalled()
    expect(sendPhoto).toHaveBeenCalled()
    expect(
      fetchSpy.mock.calls.some(([input]) =>
        String(input).includes('currency-api'),
      ),
    ).toBe(false)
  })

  test('/c falls back to the image when Telegram rejects the widget', async () => {
    mockSources()
    mockGetCurrencyImage.mockResolvedValue(Buffer.from('png'))
    const { ctx, sendWidget, sendPhoto } = createContext('private')
    sendWidget.mockRejectedValue(new Error('too large'))

    await sendCurrencyCommand(ctx, { widget: true })

    expect(sendPhoto).toHaveBeenCalled()
  })
})
