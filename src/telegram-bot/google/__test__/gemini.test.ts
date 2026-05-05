import type { Message } from 'telegram-typings'

import * as common from '@tg-bot/common'
import { generateImage, generateMultimodalCompletion } from '../gemini'

const mockInteractionsCreate = jest.fn().mockResolvedValue({
  text: 'Test response',
  files: [],
})
const mockTextCompletion = jest.fn().mockResolvedValue({
  text: 'Test response',
})
const mockGoogleTools = {
  googleSearch: jest.fn(() => ({
    inputSchema: { type: 'object', properties: {} },
  })),
  urlContext: jest.fn(() => ({
    inputSchema: { type: 'object', properties: {} },
  })),
}

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
    process.env.GEMINI_API_KEY = 'test-key'
    mockIsAiEnabledChat.mockReset()
    mockGetHistory.mockReset()
    mockGetHistory.mockResolvedValue([] as never)
    mockGetRawHistory.mockReset()
    mockGetRawHistory.mockResolvedValue([] as never)
    mockResolveHistoryMediaAttachments.mockReset()
    mockResolveHistoryMediaAttachments.mockResolvedValue([] as never)
    mockInteractionsCreate.mockReset()
    mockInteractionsCreate.mockResolvedValue({
      text: 'Test response',
      files: [],
    })
    mockTextCompletion.mockReset()
    mockTextCompletion.mockResolvedValue({
      text: 'Test response',
    })
    mockGoogleTools.googleSearch.mockClear()
    mockGoogleTools.urlContext.mockClear()
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
        googleTools: mockGoogleTools as never,
        createTextCompletion: mockTextCompletion,
      })

      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(123)
      expect(mockTextCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          maxRetries: 0,
          providerOptions: { google: { serviceTier: 'priority' } },
          timeout: 240_000,
          tools: expect.objectContaining({
            google_search: expect.anything(),
            url_context: expect.anything(),
          }),
        }),
      )
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
        googleTools: mockGoogleTools as never,
        createTextCompletion: mockTextCompletion,
        api,
      })

      expect(mockGetRawHistory).toHaveBeenCalledWith(123)
      expect(mockResolveHistoryMediaAttachments).toHaveBeenCalledWith(
        [
          {
            ref: {
              fileId: 'history_photo',
              fileUniqueId: 'history_photo',
              mimeType: 'image/jpeg',
              mediaType: 'image',
            },
            message: expect.objectContaining({ message_id: 41 }),
          },
        ],
        api,
      )

      const request = mockTextCompletion.mock.calls[0]?.[0] as {
        messages: Array<{
          role: 'user' | 'assistant'
          content: Array<
            | { type: 'text'; text: string }
            | { type: 'image'; image: Buffer; mediaType: string }
          >
        }>
      }

      expect(request.messages).toHaveLength(4)
      expect(request.messages[0]?.content).toEqual([
        {
          type: 'text',
          text: 'Context image from recent chat history. Related message text: old screenshot',
        },
        {
          type: 'image',
          image: Buffer.from('history-image'),
          mediaType: 'image/png',
        },
      ])
      expect(request.messages[1]?.content).toEqual([
        {
          type: 'text',
          text: 'Request image 1 (current command, reply, or album media; source label unavailable)',
        },
        {
          type: 'image',
          image: Buffer.from('current-image'),
          mediaType: 'image/jpeg',
        },
      ])
      expect(request.messages[2]?.content).toEqual([
        {
          type: 'text',
          text: expect.stringContaining('Media priority'),
        },
      ])
      expect(
        JSON.parse(
          (request.messages[3]?.content[0] as { type: 'text'; text: string })
            .text,
        ),
      ).toEqual(expect.objectContaining({ text: 'test prompt' }))

      consoleSpy.mockRestore()
    })

    test('does not duplicate reply image from history when request image is labeled', async () => {
      mockIsAiEnabledChat.mockReturnValue(true)
      mockGetHistory.mockResolvedValue([] as never)
      mockGetRawHistory.mockResolvedValue([
        {
          message_id: 41,
          photo: [
            {
              file_id: 'reply_photo',
              file_unique_id: 'reply-photo',
              width: 1000,
              height: 1000,
            },
          ],
        },
      ] as never)

      await generateMultimodalCompletion({
        prompt: 'что на фото?',
        message: { chat: { id: 123 }, message_id: 42 } as Message,
        imageInputs: [
          {
            data: Buffer.from('reply-image'),
            label: 'Reply message image (message_id=41)',
            mimeType: 'image/jpeg',
            fileId: 'reply_photo',
            fileUniqueId: 'reply-photo',
          },
        ],
        model: 'gemini-3.1-flash-lite-preview',
        googleTools: mockGoogleTools as never,
        createTextCompletion: mockTextCompletion,
        api: { getFile: jest.fn() },
      })

      expect(mockResolveHistoryMediaAttachments).not.toHaveBeenCalled()

      const request = mockTextCompletion.mock.calls[0]?.[0] as {
        messages: Array<{
          content: Array<
            | { type: 'text'; text: string }
            | { type: 'image'; image: Buffer; mediaType: string }
          >
        }>
      }

      expect(request.messages[0]?.content).toEqual([
        { type: 'text', text: 'Reply message image (message_id=41)' },
        {
          type: 'image',
          image: Buffer.from('reply-image'),
          mediaType: 'image/jpeg',
        },
      ])
      expect(JSON.stringify(request.messages)).not.toContain('History image')
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
        createTextCompletion: mockTextCompletion,
      })

      expect(mockTextCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining(
            'Format responses for Telegram MarkdownV2',
          ),
          timeout: 240_000,
        }),
      )

      const request = mockTextCompletion.mock.calls[0]?.[0] as {
        system?: string
        tools?: unknown
      }

      expect(request.tools).toBeUndefined()
      expect(request.system).toContain(
        'do not have access to web search or tools',
      )
      expect(request.system).not.toContain('use search first')

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
          text: 'No image yet',
          files: [],
        })
        .mockResolvedValueOnce({
          text: 'Still no image',
          files: [],
        })
        .mockResolvedValueOnce({
          text: 'Image generated',
          files: [{ mediaType: 'image/png', uint8Array: imageBuffer }],
        })

      const result = await generateImage(
        'test prompt',
        123,
        undefined,
        undefined,
        mockInteractionsCreate,
      )

      expect(mockInteractionsCreate).toHaveBeenCalledTimes(3)
      expect(result.image).toEqual(imageBuffer)
      expect(result.text).toBe('Image generated')
      expect(mockInteractionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining(
            'Always return at least one generated image',
          ),
        }),
      )
    })

    test('/ge image generation labels reply media in the edit prompt', async () => {
      mockIsAiEnabledChat.mockReturnValue(true)
      const imageBuffer = Buffer.from('fake-image-data')
      mockInteractionsCreate.mockResolvedValueOnce({
        text: 'Image generated',
        files: [{ mediaType: 'image/png', uint8Array: imageBuffer }],
      })

      await generateImage(
        'make it brighter',
        123,
        [],
        [
          {
            data: Buffer.from('reply-image'),
            label: 'Reply message image (message_id=41)',
            mimeType: 'image/jpeg',
            fileId: 'reply_photo',
          },
        ],
        mockInteractionsCreate,
      )

      const request = mockInteractionsCreate.mock.calls[0]?.[0] as {
        messages: Array<{
          role: 'user'
          content: Array<
            | { type: 'text'; text: string }
            | { type: 'image'; image: Buffer; mediaType: string }
          >
        }>
      }

      expect(request.messages[0]?.content).toEqual([
        { type: 'text', text: 'Reply message image (message_id=41)' },
        {
          type: 'image',
          image: Buffer.from('reply-image'),
          mediaType: 'image/jpeg',
        },
      ])
      expect(request.messages[1]?.content[0]).toEqual({
        type: 'text',
        text: expect.stringContaining('Reply message image (message_id=41)'),
      })
    })

    test('returns text fallback when no image after all retries', async () => {
      mockIsAiEnabledChat.mockReturnValue(true)

      mockInteractionsCreate
        .mockResolvedValueOnce({
          text: 'Fallback text from first try',
          files: [],
        })
        .mockResolvedValueOnce({
          text: '',
          files: [],
        })
        .mockResolvedValueOnce({
          text: '',
          files: [],
        })

      const result = await generateImage(
        'test prompt',
        123,
        undefined,
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
        .mockResolvedValueOnce({ text: '', files: [] })
        .mockResolvedValueOnce({ text: '', files: [] })
        .mockResolvedValueOnce({ text: '', files: [] })

      const result = await generateImage(
        'test prompt',
        123,
        undefined,
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
