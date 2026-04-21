import * as common from '@tg-bot/common'
import { generateImage, generateMultimodalCompletion } from '../open-ai'

const mockImageGenerate = jest.fn().mockResolvedValue({
  data: [{ url: 'https://example.com/image.png' }],
})
const mockImageEdit = jest.fn().mockResolvedValue({
  data: [{ url: 'https://example.com/image.png' }],
})
const mockChatCompletionCreate = jest.fn().mockResolvedValue({
  choices: [{ message: { content: 'Test response' } }],
})

// Mock OpenAI
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      images: {
        generate: mockImageGenerate,
        edit: mockImageEdit,
      },
      chat: {
        completions: {
          create: mockChatCompletionCreate,
        },
      },
    })),
  }
})

const mockIsAiEnabledChat = jest.spyOn(common, 'isAiEnabledChat')

const NOT_ALLOWED_ERROR =
  'AI is not allowed for this chat. Contact @drrrrrrrr for details'

describe('open-ai AI access control', () => {
  beforeAll(() => {
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key'
  })

  beforeEach(() => {
    mockIsAiEnabledChat.mockReset()
    mockImageGenerate.mockClear()
    mockImageEdit.mockClear()
    mockChatCompletionCreate.mockClear()
  })

  describe('generateImage', () => {
    test('throws NOT_ALLOWED_ERROR when chat is not in OPENAI_CHAT_IDS', async () => {
      mockIsAiEnabledChat.mockReturnValue(false)

      await expect(
        generateImage('test prompt', 999, 'dall-e-3'),
      ).rejects.toThrow(NOT_ALLOWED_ERROR)
      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(999)
    })

    test('uses gpt-image-2 with wrapped prompt and auto size', async () => {
      mockIsAiEnabledChat.mockReturnValue(true)

      await generateImage(
        'Draw album cover art',
        123,
        common.OPENAI_GPT_IMAGE_MODEL,
      )

      expect(mockImageGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: common.OPENAI_GPT_IMAGE_MODEL,
          quality: 'medium',
          size: common.OPENAI_GPT_IMAGE_SIZE,
          prompt: expect.stringContaining('Composition note:'),
        }),
      )
    })

    test('edits input images with gpt-image-2', async () => {
      mockIsAiEnabledChat.mockReturnValue(true)

      await generateImage(
        'Extend this image',
        123,
        common.OPENAI_GPT_IMAGE_MODEL,
        [Buffer.from('image')],
      )

      expect(mockImageEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          model: common.OPENAI_GPT_IMAGE_MODEL,
          quality: 'medium',
          size: common.OPENAI_GPT_IMAGE_SIZE,
          prompt: expect.stringContaining('Composition note:'),
        }),
      )
    })
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
