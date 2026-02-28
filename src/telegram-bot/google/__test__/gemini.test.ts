import type { Message } from 'telegram-typings'

import * as common from '@tg-bot/common'
import { generateImage, generateMultimodalCompletion } from '../gemini'

const mockInteractionsCreate = jest.fn().mockResolvedValue({
  outputs: [{ type: 'text', text: 'Test response' }],
})

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
    mockInteractionsCreate.mockReset()
    mockInteractionsCreate.mockResolvedValue({
      outputs: [{ type: 'text', text: 'Test response' }],
    })
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
      const result = await generateMultimodalCompletion(
        'test prompt',
        message,
        undefined,
        'gemini-3-flash-preview',
        mockInteractionsCreate,
      )

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

      const result = await generateImage(
        'test prompt',
        123,
        undefined,
        mockInteractionsCreate,
      )

      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(123)
      expect(result.text).not.toBe(NOT_ALLOWED_ERROR)
      consoleSpy.mockRestore()
    })

    test('retries up to 3 times and returns image when image appears', async () => {
      mockIsAiEnabledChat.mockReturnValue(true)

      const imageBuffer = Buffer.from('fake-image-data')
      mockInteractionsCreate
        .mockResolvedValueOnce({
          outputs: [{ type: 'text', text: 'No image yet' }],
        })
        .mockResolvedValueOnce({
          outputs: [{ type: 'text', text: 'Still no image' }],
        })
        .mockResolvedValueOnce({
          outputs: [
            { type: 'text', text: 'Image generated' },
            { type: 'image', data: imageBuffer.toString('base64') },
          ],
        })

      const result = await generateImage(
        'test prompt',
        123,
        undefined,
        mockInteractionsCreate,
      )

      expect(mockInteractionsCreate).toHaveBeenCalledTimes(3)
      expect(result.image).toEqual(imageBuffer)
      expect(result.text).toBe('Image generated')
      expect(mockInteractionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system_instruction: expect.stringContaining(
            'Always return at least one generated image',
          ),
        }),
      )
    })

    test('returns text fallback when no image after all retries', async () => {
      mockIsAiEnabledChat.mockReturnValue(true)

      mockInteractionsCreate
        .mockResolvedValueOnce({
          outputs: [{ type: 'text', text: 'Fallback text from first try' }],
        })
        .mockResolvedValueOnce({
          outputs: [],
        })
        .mockResolvedValueOnce({
          outputs: [],
        })

      const result = await generateImage(
        'test prompt',
        123,
        undefined,
        mockInteractionsCreate,
      )

      expect(mockInteractionsCreate).toHaveBeenCalledTimes(3)
      expect(result.image).toBeUndefined()
      expect(result.text).toBe('Fallback text from first try')
    })

    test('returns EMPTY_RESPONSE_ERROR when no image and no text', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      mockIsAiEnabledChat.mockReturnValue(true)

      mockInteractionsCreate
        .mockResolvedValueOnce({ outputs: [] })
        .mockResolvedValueOnce({ outputs: [] })
        .mockResolvedValueOnce({ outputs: [] })

      const result = await generateImage(
        'test prompt',
        123,
        undefined,
        mockInteractionsCreate,
      )

      expect(mockInteractionsCreate).toHaveBeenCalledTimes(3)
      expect(result.image).toBeNull()
      expect(result.text).toBe(common.EMPTY_RESPONSE_ERROR)
      consoleSpy.mockRestore()
    })
  })
})
