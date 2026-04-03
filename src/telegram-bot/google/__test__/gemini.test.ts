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
const mockGetRawHistory = jest
  .spyOn(common, 'getRawHistory')
  .mockResolvedValue([] as never)
const mockResolveHistoryMediaAttachments = jest
  .spyOn(common, 'resolveHistoryMediaAttachments')
  .mockResolvedValue([] as never)

const NOT_ALLOWED_ERROR =
  'AI is not allowed for this chat. Contact @drrrrrrrr for details'

describe('gemini AI access control', () => {
  beforeEach(() => {
    mockIsAiEnabledChat.mockReset()
    mockGetHistory.mockReset()
    mockGetHistory.mockResolvedValue([] as never)
    mockGetRawHistory.mockReset()
    mockGetRawHistory.mockResolvedValue([] as never)
    mockResolveHistoryMediaAttachments.mockReset()
    mockResolveHistoryMediaAttachments.mockResolvedValue([] as never)
    mockInteractionsCreate.mockReset()
    mockInteractionsCreate.mockResolvedValue({
      outputs: [{ type: 'text', text: 'Test response' }],
    })
  })

  afterAll(() => {
    mockIsAiEnabledChat.mockRestore()
    mockGetHistory.mockRestore()
    mockGetRawHistory.mockRestore()
    mockResolveHistoryMediaAttachments.mockRestore()
  })

  describe('generateMultimodalCompletion', () => {
    test('returns NOT_ALLOWED_ERROR when chat is not in OPENAI_CHAT_IDS', async () => {
      mockIsAiEnabledChat.mockReturnValue(false)

      const message = { chat: { id: 999 } } as Message
      const result = await generateMultimodalCompletion({
        prompt: 'test prompt',
        message,
      })

      expect(result).toBe(NOT_ALLOWED_ERROR)
      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(999)
    })

    test('returns NOT_ALLOWED_ERROR when chatId is undefined', async () => {
      mockIsAiEnabledChat.mockReturnValue(false)

      const message = { chat: undefined } as unknown as Message
      const result = await generateMultimodalCompletion({
        prompt: 'test prompt',
        message,
      })

      expect(result).toBe(NOT_ALLOWED_ERROR)
    })

    test('proceeds when chat IS in OPENAI_CHAT_IDS', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      mockIsAiEnabledChat.mockReturnValue(true)

      const message = { chat: { id: 123 } } as Message
      const result = await generateMultimodalCompletion({
        prompt: 'test prompt',
        message,
        model: 'gemini-3.1-flash-lite-preview',
        createInteraction: mockInteractionsCreate,
      })

      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(123)
      expect(result).not.toBe(NOT_ALLOWED_ERROR)
      consoleSpy.mockRestore()
    })

    test('includes recent history images when api access is available', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      mockIsAiEnabledChat.mockReturnValue(true)
      mockGetHistory.mockResolvedValue([] as never)
      mockGetRawHistory.mockResolvedValue([
        {
          message_id: 41,
          photo: [
            {
              file_id: 'history_photo',
              file_unique_id: 'history_photo',
              width: 1000,
              height: 1000,
            },
          ],
        },
      ] as never)
      mockResolveHistoryMediaAttachments.mockResolvedValue([
        {
          message: {
            message_id: 41,
            caption: 'old screenshot',
          } as Message,
          media: {
            buffer: Buffer.from('history-image'),
            mimeType: 'image/png',
            mediaType: 'image',
          },
        },
      ] as never)

      const message = { chat: { id: 123 }, message_id: 42 } as Message
      const api = {
        getFile: jest.fn(),
      }

      await generateMultimodalCompletion({
        prompt: 'test prompt',
        message,
        imagesData: [Buffer.from('current-image')],
        model: 'gemini-3.1-flash-lite-preview',
        createInteraction: mockInteractionsCreate,
        api,
      })

      expect(mockGetRawHistory).toHaveBeenCalledWith(123)
      expect(mockResolveHistoryMediaAttachments).toHaveBeenCalledWith(
        [
          {
            ref: {
              fileId: 'history_photo',
              mimeType: 'image/jpeg',
              mediaType: 'image',
            },
            message: expect.objectContaining({ message_id: 41 }),
          },
        ],
        api,
      )

      const request = mockInteractionsCreate.mock.calls[0]?.[0] as {
        input: Array<{
          role: 'user' | 'model'
          content: Array<
            | { type: 'text'; text: string }
            | { type: 'image'; data: string; mime_type: string }
          >
        }>
      }

      expect(request.input).toHaveLength(3)
      expect(request.input[0]?.content).toEqual([
        {
          type: 'text',
          text: 'Context image from recent chat history. Related message text: old screenshot',
        },
        {
          type: 'image',
          data: Buffer.from('history-image').toString('base64'),
          mime_type: 'image/png',
        },
      ])
      expect(request.input[1]?.content).toEqual([
        {
          type: 'image',
          data: Buffer.from('current-image').toString('base64'),
          mime_type: 'image/jpeg',
        },
      ])
      expect(
        JSON.parse(
          (request.input[2]?.content[0] as { type: 'text'; text: string }).text,
        ),
      ).toEqual(expect.objectContaining({ text: 'test prompt' }))

      consoleSpy.mockRestore()
    })

    test('passes text formatting instructions to gemma models without enabling tools', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      mockIsAiEnabledChat.mockReturnValue(true)

      const message = { chat: { id: 123 } } as Message

      await generateMultimodalCompletion({
        prompt: 'test prompt',
        message,
        model: 'gemma-4-31b-it',
        createInteraction: mockInteractionsCreate,
      })

      expect(mockInteractionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemma-4-31b-it',
          system_instruction: expect.stringContaining(
            'Format responses for Telegram MarkdownV2',
          ),
        }),
      )

      const request = mockInteractionsCreate.mock.calls[0]?.[0] as {
        system_instruction?: string
        tools?: unknown
      }

      expect(request.tools).toBeUndefined()
      expect(request.system_instruction).toContain(
        'do not have access to web search or tools',
      )
      expect(request.system_instruction).not.toContain('use search first')

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
