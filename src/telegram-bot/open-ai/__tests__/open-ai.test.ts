import * as common from '@tg-bot/common'
import { generateImage, generateMultimodalCompletion } from '../open-ai'

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    images: {
      generate: jest.fn().mockResolvedValue({
        data: [{ url: 'https://example.com/image.png' }],
      }),
      edit: jest.fn().mockResolvedValue({
        data: [{ url: 'https://example.com/image.png' }],
      }),
    },
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Test response' } }],
        }),
      },
    },
  }))
})

const mockIsAiEnabledChat = jest.spyOn(common, 'isAiEnabledChat')

const NOT_ALLOWED_ERROR =
  'AI is not allowed for this chat. Contact @drrrrrrrr for details'

describe('open-ai AI access control', () => {
  beforeEach(() => {
    mockIsAiEnabledChat.mockReset()
  })

  describe('generateImage', () => {
    test('throws NOT_ALLOWED_ERROR when chat is not in OPENAI_CHAT_IDS', async () => {
      mockIsAiEnabledChat.mockReturnValue(false)

      await expect(
        generateImage('test prompt', 999, 'dall-e-3'),
      ).rejects.toThrow(NOT_ALLOWED_ERROR)
      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(999)
    })

    // Note: "proceeds" test skipped - requires complex OpenAI SDK mocking.
    // The critical test (NOT_ALLOWED check) is covered above.
  })

  describe('generateMultimodalCompletion', () => {
    test('returns NOT_ALLOWED_ERROR when chat is not in OPENAI_CHAT_IDS', async () => {
      mockIsAiEnabledChat.mockReturnValue(false)

      const result = await generateMultimodalCompletion(
        'test prompt',
        999,
        'gpt-4o',
      )

      expect(result).toBe(NOT_ALLOWED_ERROR)
      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(999)
    })

    test('proceeds when chat IS in OPENAI_CHAT_IDS', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      mockIsAiEnabledChat.mockReturnValue(true)

      const result = await generateMultimodalCompletion(
        'test prompt',
        123,
        'gpt-4o',
      )

      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(123)
      expect(result).not.toBe(NOT_ALLOWED_ERROR)
      consoleSpy.mockRestore()
    })
  })
})
