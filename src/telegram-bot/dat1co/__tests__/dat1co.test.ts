import * as common from '@tg-bot/common'
import { generateGemmaCompletion, generateImageDat1co } from '../dat1co'

// Mock fetch
global.fetch = jest.fn()

const mockIsAiEnabledChat = jest.spyOn(common, 'isAiEnabledChat')
const mockGetHistory = jest
  .spyOn(common, 'getHistory')
  .mockResolvedValue([] as never)

const mockFetch = global.fetch as jest.Mock
const NOT_ALLOWED_ERROR =
  'AI is not allowed for this chat. Contact @drrrrrrrr for details'

describe('dat1co AI access control', () => {
  const originalEnv = process.env

  beforeEach(() => {
    mockIsAiEnabledChat.mockReset()
    mockGetHistory.mockClear()
    mockFetch.mockReset()
    process.env = { ...originalEnv, DAT1CO_API_KEY: 'test-api-key' }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('generateGemmaCompletion', () => {
    test('returns NOT_ALLOWED_ERROR when chat is not in OPENAI_CHAT_IDS', async () => {
      mockIsAiEnabledChat.mockReturnValue(false)

      const result = await generateGemmaCompletion('test prompt', 999)

      expect(result).toBe(NOT_ALLOWED_ERROR)
      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(999)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('proceeds when chat IS in OPENAI_CHAT_IDS', async () => {
      mockIsAiEnabledChat.mockReturnValue(true)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Test response' } }],
          }),
      })

      const result = await generateGemmaCompletion('test prompt', 123)

      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(123)
      expect(mockFetch).toHaveBeenCalled()
      expect(result).not.toBe(NOT_ALLOWED_ERROR)
    })
  })

  describe('generateImageDat1co', () => {
    test('throws NOT_ALLOWED_ERROR when chat is not in OPENAI_CHAT_IDS', async () => {
      mockIsAiEnabledChat.mockReturnValue(false)

      await expect(generateImageDat1co('test prompt', 999)).rejects.toThrow(
        NOT_ALLOWED_ERROR,
      )
      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(999)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('proceeds when chat IS in OPENAI_CHAT_IDS', async () => {
      mockIsAiEnabledChat.mockReturnValue(true)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: Buffer.from('test').toString('base64'),
          }),
      })

      const result = await generateImageDat1co('test prompt', 123)

      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(123)
      expect(mockFetch).toHaveBeenCalled()
      expect(Buffer.isBuffer(result)).toBe(true)
    })
  })
})
