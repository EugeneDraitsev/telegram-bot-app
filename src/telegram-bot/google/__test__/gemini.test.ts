import type { Message } from 'telegram-typings'

import * as common from '@tg-bot/common'
import { generateImage, generateMultimodalCompletion } from '../gemini'

// Mock the Google GenAI
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    interactions: {
      create: jest.fn().mockResolvedValue({
        outputs: [{ type: 'text', text: 'Test response' }],
      }),
    },
  })),
}))

const mockIsAiEnabledChat = jest.spyOn(common, 'isAiEnabledChat')
const mockGetHistory = jest
  .spyOn(common, 'getHistory')
  .mockResolvedValue([] as never)

const NOT_ALLOWED_ERROR =
  'AI is not allowed for this chat. Contact @drrrrrrrr for details'

describe('gemini AI access control', () => {
  beforeEach(() => {
    mockIsAiEnabledChat.mockReset()
    mockGetHistory.mockClear()
  })

  describe('generateMultimodalCompletion', () => {
    test('returns NOT_ALLOWED_ERROR when chat is not in OPENAI_CHAT_IDS', async () => {
      mockIsAiEnabledChat.mockReturnValue(false)

      const message = { chat: { id: 999 } } as Message
      const result = await generateMultimodalCompletion('test prompt', message)

      expect(result).toBe(NOT_ALLOWED_ERROR)
      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(999)
    })

    test('returns NOT_ALLOWED_ERROR when chatId is undefined', async () => {
      mockIsAiEnabledChat.mockReturnValue(false)

      const message = { chat: undefined } as unknown as Message
      const result = await generateMultimodalCompletion('test prompt', message)

      expect(result).toBe(NOT_ALLOWED_ERROR)
    })

    test('proceeds when chat IS in OPENAI_CHAT_IDS', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      mockIsAiEnabledChat.mockReturnValue(true)

      const message = { chat: { id: 123 } } as Message
      const result = await generateMultimodalCompletion('test prompt', message)

      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(123)
      expect(result).not.toBe(NOT_ALLOWED_ERROR)
      consoleSpy.mockRestore()
    })
  })

  describe('generateImage', () => {
    test('returns NOT_ALLOWED_ERROR when chat is not in OPENAI_CHAT_IDS', async () => {
      mockIsAiEnabledChat.mockReturnValue(false)

      const result = await generateImage('test prompt', 999)

      expect(result).toEqual({ text: NOT_ALLOWED_ERROR })
      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(999)
    })

    test('proceeds when chat IS in OPENAI_CHAT_IDS', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      mockIsAiEnabledChat.mockReturnValue(true)

      const result = await generateImage('test prompt', 123)

      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(123)
      expect(result.text).not.toBe(NOT_ALLOWED_ERROR)
      consoleSpy.mockRestore()
    })
  })
})
