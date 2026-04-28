import type { Message } from 'telegram-typings'

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
const mockResponsesCreate = jest.fn().mockResolvedValue({
  output_text: 'Test response',
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
      responses: {
        create: mockResponsesCreate,
      },
    })),
  }
})

const mockIsAiEnabledChat = jest.spyOn(common, 'isAiEnabledChat')
const mockGetRawHistory = jest
  .spyOn(common, 'getRawHistory')
  .mockResolvedValue([] as never)
const mockResolveHistoryMediaAttachments = jest
  .spyOn(common, 'resolveHistoryMediaAttachments')
  .mockResolvedValue([] as never)

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
    mockResponsesCreate.mockClear()
    mockResponsesCreate.mockResolvedValue({
      output_text: 'Test response',
    })
    mockGetRawHistory.mockReset()
    mockGetRawHistory.mockResolvedValue([] as never)
    mockResolveHistoryMediaAttachments.mockReset()
    mockResolveHistoryMediaAttachments.mockResolvedValue([] as never)
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
        'gpt-5.5',
      )

      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(123)
      expect(mockResponsesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5.5',
          instructions: expect.any(String),
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: expect.stringContaining('test prompt'),
                },
              ],
            },
          ],
          reasoning: { effort: 'medium' },
          tools: [{ type: 'web_search', search_context_size: 'high' }],
          tool_choice: 'auto',
          include: ['web_search_call.action.sources'],
          safety_identifier: '123',
          store: false,
        }),
        { timeout: 240_000, maxRetries: 0 },
      )
      expect(mockChatCompletionCreate).not.toHaveBeenCalled()
      expect(result).not.toBe(NOT_ALLOWED_ERROR)
      consoleSpy.mockRestore()
    })

    test('sends images through OpenAI Responses vision input', async () => {
      mockIsAiEnabledChat.mockReturnValue(true)

      await generateMultimodalCompletion('what is this?', 123, 'gpt-5.5', [
        Buffer.from('image'),
      ])

      expect(mockResponsesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: expect.stringContaining('Request image 1'),
                },
                {
                  type: 'input_image',
                  image_url: `data:image/jpeg;base64,${Buffer.from('image').toString('base64')}`,
                  detail: 'high',
                },
                {
                  type: 'input_text',
                  text: expect.stringContaining('what is this?'),
                },
              ],
            },
          ],
        }),
        { timeout: 240_000, maxRetries: 0 },
      )
    })

    test('includes compact chat history and labeled history images', async () => {
      mockIsAiEnabledChat.mockReturnValue(true)
      mockGetRawHistory.mockResolvedValue([
        {
          message_id: 41,
          date: 1_777_381_000,
          from: { first_name: 'Eugene' },
          caption: 'tree photo',
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
            caption: 'tree photo',
          } as Message,
          media: {
            buffer: Buffer.from('history-image'),
            mimeType: 'image/png',
            mediaType: 'image',
          },
        },
      ] as never)

      await generateMultimodalCompletion(
        'че за дерево на последней фотке?',
        123,
        'gpt-5.5',
        [],
        'medium',
        {
          message: {
            chat: { id: 123 },
            message_id: 42,
            text: '/o че за дерево на последней фотке?',
          } as Message,
          api: { getFile: jest.fn() },
        },
      )

      const request = mockResponsesCreate.mock.calls[0]?.[0] as {
        input: Array<{
          role: 'user'
          content: Array<{ type: string; text?: string; image_url?: string }>
        }>
        reasoning: { effort: string }
      }

      expect(mockGetRawHistory).toHaveBeenCalledWith(123)
      expect(mockResolveHistoryMediaAttachments).toHaveBeenCalled()
      expect(request.reasoning).toEqual({ effort: 'medium' })
      expect(request.input[0]?.content).toEqual(
        expect.arrayContaining([
          {
            type: 'input_text',
            text: expect.stringContaining('Recent Telegram chat history'),
          },
          {
            type: 'input_text',
            text: expect.stringContaining('History image 1/1'),
          },
          {
            type: 'input_image',
            image_url: `data:image/png;base64,${Buffer.from('history-image').toString('base64')}`,
            detail: 'high',
          },
          {
            type: 'input_text',
            text: expect.stringContaining('последней фотке'),
          },
        ]),
      )
    })

    test('does not duplicate reply image from history when request image is labeled', async () => {
      mockIsAiEnabledChat.mockReturnValue(true)
      mockGetRawHistory.mockResolvedValue([
        {
          message_id: 41,
          caption: 'reply tree',
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

      await generateMultimodalCompletion(
        'что за дерево?',
        123,
        'gpt-5.5',
        [],
        'medium',
        {
          message: {
            chat: { id: 123 },
            message_id: 42,
            text: '/o что за дерево?',
          } as Message,
          imageInputs: [
            {
              data: Buffer.from('reply-image'),
              label: 'Reply message image (message_id=41)',
              mimeType: 'image/jpeg',
              fileId: 'reply_photo',
              fileUniqueId: 'reply-photo',
            },
          ],
          api: { getFile: jest.fn() },
        },
      )

      expect(mockResolveHistoryMediaAttachments).not.toHaveBeenCalled()

      const request = mockResponsesCreate.mock.calls[0]?.[0] as {
        input: Array<{
          content: Array<{ type: string; text?: string; image_url?: string }>
        }>
      }
      const contentText = JSON.stringify(request.input[0]?.content)

      expect(contentText).toContain('Reply message image')
      expect(contentText).not.toContain('History image')
      expect(
        request.input[0]?.content.filter((part) => part.type === 'input_image'),
      ).toHaveLength(1)
    })
  })
})
