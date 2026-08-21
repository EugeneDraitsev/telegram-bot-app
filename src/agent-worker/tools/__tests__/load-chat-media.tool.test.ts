import type { Message } from 'grammy/types'

import type { MediaBuffer } from '@tg-bot/common'
import * as common from '@tg-bot/common'
import {
  requireToolContext,
  runWithToolContext,
  setToolHistoryMessages,
  takePendingModelInspectionImages,
} from '../context'
import { loadChatMediaTool } from '../load-chat-media.tool'

const getRawHistoryMock = jest.spyOn(common, 'getRawHistory')
const resolveMediaBuffersMock = jest.spyOn(common, 'resolveMediaBuffers')

const currentMessage = {
  message_id: 999,
  chat: { id: 777, type: 'private' },
} as Message

const historyPhoto = {
  message_id: 123,
  chat: { id: 777, type: 'private' },
  photo: [
    {
      file_id: 'photo-file',
      file_unique_id: 'photo-unique',
      width: 512,
      height: 512,
    },
  ],
} as Message

const loadedPhoto: MediaBuffer = {
  buffer: Buffer.from('photo'),
  mimeType: 'image/jpeg',
  mediaType: 'image',
  fileId: 'photo-file',
  fileUniqueId: 'photo-unique',
  context: { relation: 'history-message', messageId: 123 },
}

describe('loadChatMediaTool', () => {
  beforeEach(() => {
    getRawHistoryMock.mockReset().mockResolvedValue([historyPhoto])
    resolveMediaBuffersMock.mockReset().mockResolvedValue([loadedPhoto])
  })

  afterAll(() => {
    getRawHistoryMock.mockRestore()
    resolveMediaBuffersMock.mockRestore()
  })

  test('loads one exact historical message and registers its media id', async () => {
    const currentImage: MediaBuffer = {
      buffer: Buffer.from('image'),
      mimeType: 'image/jpeg',
      mediaType: 'image',
      fileId: 'image-file',
    }
    const rawGetFile = jest.fn().mockResolvedValue({
      file_id: 'photo-file',
      file_unique_id: 'photo-unique',
      file_path: 'photo-file.jpg',
    })
    const api = {
      raw: { getFile: rawGetFile },
      getFile(this: { raw: { getFile: typeof rawGetFile } }, fileId: string) {
        return this.raw.getFile(fileId)
      },
    }
    resolveMediaBuffersMock.mockImplementationOnce(async (_refs, resolver) => {
      await resolver.getFile('photo-file')
      return [loadedPhoto]
    })

    const result = await runWithToolContext(
      currentMessage,
      [currentImage],
      async () => {
        const toolResult = await loadChatMediaTool.execute({ messageId: 123 })
        expect(requireToolContext().mediaBuffers).toEqual([
          currentImage,
          { ...loadedPhoto, origin: 'history' },
        ])
        return toolResult
      },
      api as never,
    )

    expect(getRawHistoryMock).toHaveBeenCalledWith(777)
    expect(resolveMediaBuffersMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          fileId: 'photo-file',
          mediaType: 'image',
        }),
      ],
      { getFile: expect.any(Function) },
    )
    expect(rawGetFile).toHaveBeenCalledWith('photo-file')
    expect(result).toBe(
      'media_id=2 message_id=123 type=image mime_type=image/jpeg model_inspection=available',
    )
  })

  test('uses preloaded recent history before reading full retained history', async () => {
    const result = await runWithToolContext(
      currentMessage,
      [],
      async () => {
        setToolHistoryMessages([historyPhoto])
        return loadChatMediaTool.execute({ messageId: 123 })
      },
      { getFile: jest.fn() } as never,
    )

    expect(getRawHistoryMock).not.toHaveBeenCalled()
    expect(resolveMediaBuffersMock).toHaveBeenCalledTimes(1)
    expect(result).toContain('media_id=1 message_id=123')
  })

  test('does not guess or fall back when the exact message id is absent', async () => {
    await expect(
      runWithToolContext(
        currentMessage,
        [],
        () => loadChatMediaTool.execute({ messageId: 124 }),
        { getFile: jest.fn() } as never,
      ),
    ).rejects.toThrow(
      'message_id 124 is not available in retained chat history',
    )

    expect(resolveMediaBuffersMock).not.toHaveBeenCalled()
  })

  test('rejects a historical message without supported images', async () => {
    getRawHistoryMock.mockResolvedValueOnce([
      {
        message_id: 123,
        chat: { id: 777, type: 'private' },
        text: 'text only',
      } as Message,
    ])

    await expect(
      runWithToolContext(
        currentMessage,
        [],
        () => loadChatMediaTool.execute({ messageId: 123 }),
        { getFile: jest.fn() } as never,
      ),
    ).rejects.toThrow('message_id 123 contains no supported images')

    expect(resolveMediaBuffersMock).not.toHaveBeenCalled()
  })

  test('rejects images that Telegram could not load', async () => {
    resolveMediaBuffersMock.mockResolvedValueOnce([])

    await expect(
      runWithToolContext(
        currentMessage,
        [],
        () => loadChatMediaTool.execute({ messageId: 123 }),
        { getFile: jest.fn() } as never,
      ),
    ).rejects.toThrow('images from message_id 123 could not be loaded')
  })

  test('queues only an explicitly loaded history image for model inspection', async () => {
    const historyImage = {
      message_id: 124,
      chat: { id: 777, type: 'private' },
      photo: [
        {
          file_id: 'photo-file',
          file_unique_id: 'photo-unique',
          width: 512,
          height: 512,
        },
      ],
    } as Message
    const loadedImage: MediaBuffer = {
      buffer: Buffer.from('history-image'),
      mimeType: 'image/jpeg',
      mediaType: 'image',
      fileId: 'photo-file',
      fileUniqueId: 'photo-unique',
      context: { relation: 'history-message', messageId: 124 },
    }
    getRawHistoryMock.mockResolvedValueOnce([historyImage])
    resolveMediaBuffersMock.mockResolvedValueOnce([loadedImage])

    await runWithToolContext(
      currentMessage,
      [],
      async () => {
        await loadChatMediaTool.execute({ messageId: 124 })
        expect(takePendingModelInspectionImages()).toEqual([
          {
            media: { ...loadedImage, origin: 'history' },
            mediaId: 1,
          },
        ])
        expect(takePendingModelInspectionImages()).toEqual([])
      },
      { getFile: jest.fn() } as never,
    )
  })

  test('reports images registered beyond the model inspection limit', async () => {
    const history = Array.from({ length: 5 }, (_, index) => ({
      message_id: index + 1,
      chat: { id: 777, type: 'private' },
      photo: [
        {
          file_id: `photo-${index + 1}`,
          file_unique_id: `photo-unique-${index + 1}`,
          width: 512,
          height: 512,
        },
      ],
    })) as Message[]
    getRawHistoryMock.mockResolvedValue(history)
    resolveMediaBuffersMock.mockImplementation(async (refs) =>
      refs.map((ref) => ({
        buffer: Buffer.from(ref.fileId),
        mimeType: ref.mimeType,
        mediaType: ref.mediaType,
        fileId: ref.fileId,
        fileUniqueId: ref.fileUniqueId,
        context: ref.context,
      })),
    )

    const results: string[] = []
    await runWithToolContext(
      currentMessage,
      [],
      async () => {
        for (const sourceMessage of history) {
          results.push(
            await loadChatMediaTool.execute({
              messageId: sourceMessage.message_id,
            }),
          )
        }
        expect(
          takePendingModelInspectionImages().map(({ mediaId }) => mediaId),
        ).toEqual([1, 2, 3, 4])
      },
      { getFile: jest.fn() } as never,
    )

    expect(results[3]).toContain('model_inspection=available')
    expect(results[4]).toContain(
      'model_inspection=registered_but_not_shown reason=attachment_limit_reached limit=4',
    )
  })

  test('requires an exact positive Telegram message id', async () => {
    await expect(
      runWithToolContext(
        currentMessage,
        [],
        () => loadChatMediaTool.execute({ messageId: 'last' }),
        { getFile: jest.fn() } as never,
      ),
    ).rejects.toThrow('messageId must be a positive Telegram message_id')
  })
})
