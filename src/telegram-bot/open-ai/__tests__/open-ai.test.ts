import type { Message } from 'telegram-typings'

const mockGenerateAiImage = jest.fn()
const mockGenerateText = jest.fn()

jest.mock('ai', () => ({
  generateImage: (...args: unknown[]) => mockGenerateAiImage(...args),
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}))

import * as common from '@tg-bot/common'
import { generateImage, generateMultimodalCompletion } from '../open-ai'

const mockIsAiEnabledChat = jest.spyOn(common, 'isAiEnabledChat')
const mockGetRawHistory = jest
  .spyOn(common, 'getRawHistory')
  .mockResolvedValue([] as never)
const mockResolveHistoryMediaAttachments = jest
  .spyOn(common, 'resolveHistoryMediaAttachments')
  .mockResolvedValue([] as never)

const NOT_ALLOWED_ERROR =
  'AI is not allowed for this chat. Contact @drrrrrrrr for details'

const imageResponse = {
  image: { uint8Array: Buffer.from('generated-image') },
  images: [{ uint8Array: Buffer.from('generated-image') }],
  warnings: [],
}

describe('open-ai AI access control', () => {
  beforeAll(() => {
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key'
  })

  beforeEach(() => {
    mockIsAiEnabledChat.mockReset()
    mockGetRawHistory.mockReset()
    mockGetRawHistory.mockResolvedValue([] as never)
    mockResolveHistoryMediaAttachments.mockReset()
    mockResolveHistoryMediaAttachments.mockResolvedValue([] as never)
    mockGenerateAiImage.mockReset()
    mockGenerateAiImage.mockResolvedValue(imageResponse)
    mockGenerateText.mockReset()
    mockGenerateText.mockResolvedValue({ text: 'Test response' })
  })

  describe('generateImage', () => {
    test('throws NOT_ALLOWED_ERROR when chat is not in OPENAI_CHAT_IDS', async () => {
      mockIsAiEnabledChat.mockReturnValue(false)

      await expect(
        generateImage('test prompt', 999, 'dall-e-3'),
      ).rejects.toThrow(NOT_ALLOWED_ERROR)
      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(999)
    })

    test('uses gpt-image-2 with wrapped prompt and medium quality', async () => {
      mockIsAiEnabledChat.mockReturnValue(true)

      await generateImage(
        'Draw album cover art',
        123,
        common.OPENAI_GPT_IMAGE_MODEL,
      )

      expect(mockGenerateAiImage).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Composition note:'),
          n: 1,
          size: common.OPENAI_GPT_IMAGE_SIZE,
          maxRetries: 0,
          providerOptions: { openai: { quality: 'medium' } },
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

      expect(mockGenerateAiImage).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.objectContaining({
            text: expect.stringContaining('Composition note:'),
            images: [Buffer.from('image')],
          }),
          size: common.OPENAI_GPT_IMAGE_SIZE,
          providerOptions: { openai: { quality: 'medium' } },
        }),
      )
    })

    test('/e image editing includes reply media label in the edit prompt', async () => {
      mockIsAiEnabledChat.mockReturnValue(true)

      await generateImage(
        'Extend this image',
        123,
        common.OPENAI_GPT_IMAGE_MODEL,
        [],
        [
          {
            data: Buffer.from('reply-image'),
            label: 'Reply message image (message_id=41)',
            mimeType: 'image/jpeg',
            fileId: 'reply_photo',
          },
        ],
      )

      expect(mockGenerateAiImage).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.objectContaining({
            text: expect.stringContaining(
              'Reply message image (message_id=41)',
            ),
          }),
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
      mockIsAiEnabledChat.mockReturnValue(true)

      const result = await generateMultimodalCompletion(
        'test prompt',
        123,
        'gpt-5.5',
      )

      expect(mockIsAiEnabledChat).toHaveBeenCalledWith(123)
      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining(
            'This OpenAI command has web search enabled. Use it for current',
          ),
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: expect.stringContaining('test prompt'),
                },
              ],
            },
          ],
          toolChoice: 'auto',
          maxRetries: 0,
          timeout: 240_000,
          providerOptions: {
            openai: {
              reasoningEffort: 'medium',
              safetyIdentifier: '123',
              store: false,
            },
          },
        }),
      )
      expect(result).not.toBe(NOT_ALLOWED_ERROR)
    })

    test('sends images through AI SDK vision input', async () => {
      mockIsAiEnabledChat.mockReturnValue(true)

      await generateMultimodalCompletion('what is this?', 123, 'gpt-5.5', [
        Buffer.from('image'),
      ])

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: expect.stringContaining('Request image 1'),
                },
                {
                  type: 'image',
                  image: Buffer.from('image'),
                  mediaType: 'image/jpeg',
                },
                {
                  type: 'text',
                  text: expect.stringContaining('what is this?'),
                },
              ],
            },
          ],
        }),
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

      const request = mockGenerateText.mock.calls[0]?.[0] as {
        messages: Array<{
          role: 'user'
          content: Array<{ type: string; text?: string; image?: Buffer }>
        }>
        providerOptions: { openai: { reasoningEffort: string } }
      }

      expect(mockGetRawHistory).toHaveBeenCalledWith(123)
      expect(mockResolveHistoryMediaAttachments).toHaveBeenCalled()
      expect(request.providerOptions.openai.reasoningEffort).toBe('medium')
      expect(request.messages[0]?.content).toEqual(
        expect.arrayContaining([
          {
            type: 'text',
            text: expect.stringContaining('Recent Telegram chat history'),
          },
          {
            type: 'text',
            text: expect.stringContaining('History image 1/1'),
          },
          {
            type: 'image',
            image: Buffer.from('history-image'),
            mediaType: 'image/png',
          },
          {
            type: 'text',
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

      const request = mockGenerateText.mock.calls[0]?.[0] as {
        messages: Array<{
          content: Array<{ type: string; text?: string; image?: Buffer }>
        }>
      }
      const contentText = JSON.stringify(request.messages[0]?.content)

      expect(contentText).toContain('Reply message image')
      expect(contentText).not.toContain('History image')
      expect(
        request.messages[0]?.content.filter((part) => part.type === 'image'),
      ).toHaveLength(1)
    })
  })
})
