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

describe('currency commands', () => {
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
})
