const mockGetCurrencyImage = jest.fn()

jest.mock('../image', () => ({
  getCurrencyImage: mockGetCurrencyImage,
}))

import { sendCurrencyMessages } from '../index'
import type { CurrencyMessages } from '../types'

const messages: CurrencyMessages = {
  sections: [
    {
      title: 'Основные пары',
      provider: 'ExchangeRate',
      rows: [{ label: '🇸🇪USD/SEK', value: '9.57' }],
    },
  ],
  richMessage: { html: '<b>Основные пары</b>' },
  text: '<b>Основные пары:</b>\n🇸🇪 USD/SEK: 9.57',
}

function createApi() {
  return {
    sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
    sendPhoto: jest.fn().mockResolvedValue({ message_id: 2 }),
    sendRichMessage: jest.fn().mockResolvedValue({ message_id: 3 }),
  }
}

describe('sendCurrencyMessages', () => {
  beforeEach(() => {
    mockGetCurrencyImage.mockReset()
  })

  test('sends rendered currency image when sharp returns png data', async () => {
    const api = createApi()
    mockGetCurrencyImage.mockResolvedValue(Buffer.from('png'))

    await sendCurrencyMessages({
      api,
      chatId: 123,
      messages,
      options: { message_thread_id: 456 },
    })

    expect(mockGetCurrencyImage).toHaveBeenCalledWith(
      messages.sections,
      undefined,
    )
    expect(api.sendPhoto).toHaveBeenCalledWith(123, expect.anything(), {
      message_thread_id: 456,
    })
    expect(api.sendRichMessage).not.toHaveBeenCalled()
    expect(api.sendMessage).not.toHaveBeenCalled()
  })

  test('passes generated background image to renderer', async () => {
    const api = createApi()
    const backgroundImage = Buffer.from('background')
    const messagesWithBackground = {
      ...messages,
      background: {
        image: backgroundImage,
        news: { answers: [], errors: [], items: [] },
      },
    }
    mockGetCurrencyImage.mockResolvedValue(Buffer.from('png'))

    await sendCurrencyMessages({
      api,
      chatId: 123,
      messages: messagesWithBackground,
    })

    expect(mockGetCurrencyImage).toHaveBeenCalledWith(
      messages.sections,
      backgroundImage,
    )
    expect(api.sendPhoto).toHaveBeenCalled()
  })

  test('falls back to rich text when image rendering is unavailable', async () => {
    const api = createApi()
    mockGetCurrencyImage.mockResolvedValue(null)

    await sendCurrencyMessages({
      api,
      chatId: 123,
      messages,
    })

    expect(api.sendPhoto).not.toHaveBeenCalled()
    expect(api.sendRichMessage).toHaveBeenCalledWith(
      123,
      messages.richMessage,
      undefined,
      undefined,
    )
    expect(api.sendMessage).not.toHaveBeenCalled()
  })

  test('can force rich text fallback without rendering an image', async () => {
    const api = createApi()

    await sendCurrencyMessages({
      api,
      chatId: 123,
      messages,
      forceFallback: true,
    })

    expect(mockGetCurrencyImage).not.toHaveBeenCalled()
    expect(api.sendPhoto).not.toHaveBeenCalled()
    expect(api.sendRichMessage).toHaveBeenCalledWith(
      123,
      messages.richMessage,
      undefined,
      undefined,
    )
  })
})
