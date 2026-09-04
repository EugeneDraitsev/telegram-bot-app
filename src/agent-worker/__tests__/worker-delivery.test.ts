import type { Context, SQSEvent } from 'aws-lambda'

import * as common from '@tg-bot/common'
import * as agent from '../agent'
import * as idempotency from '../idempotency'

let worker: typeof import('../index').default
const complete = jest.fn()
const release = jest.fn()
const context = { awsRequestId: 'request-1' } as Context
const event = {
  Records: [
    {
      messageId: 'sqs-1',
      body: JSON.stringify({
        message: { message_id: 10, chat: { id: 123 }, text: 'hello' },
        botInfo: { id: 99, username: 'test_bot' },
      }),
    },
  ],
} as SQSEvent

beforeAll(async () => {
  const createBot = jest
    .spyOn(common, 'createBot')
    .mockReturnValue({ api: {} } as ReturnType<typeof common.createBot>)
  // Bun exposes the TS default directly; NodeNext types add a CJS wrapper.
  worker = (await import('../index.js')).default as unknown as typeof worker
  createBot.mockRestore()
})

beforeEach(() => {
  complete.mockReset().mockResolvedValue(true)
  release.mockReset().mockResolvedValue(true)
  jest.spyOn(common, 'isAgenticChatEnabled').mockResolvedValue(true)
  jest
    .spyOn(idempotency, 'acquireAgentWorkerLease')
    .mockResolvedValue({ complete, release })
  jest.spyOn(common, 'getMediaGroupMessages').mockResolvedValue([])
  jest.spyOn(common, 'getMultimodalMediaData').mockResolvedValue({
    mediaBuffers: [],
    combinedText: '',
    replyId: 10,
    chatId: 123,
    message: undefined,
  })
})

afterEach(() => jest.restoreAllMocks())

test('retries an undelivered loop failure and releases the lease without completing it', async () => {
  jest
    .spyOn(agent, 'runAgenticLoop')
    .mockRejectedValue(new Error('no response delivered'))
  expect(await worker(event, context)).toEqual({
    batchItemFailures: [{ itemIdentifier: 'sqs-1' }],
  })
  expect(release).toHaveBeenCalledTimes(1)
  expect(complete).not.toHaveBeenCalled()
})

test('completes skipped or handled work without downloading media', async () => {
  jest.spyOn(agent, 'runAgenticLoop').mockResolvedValue(undefined)
  expect(await worker(event, context)).toEqual({ batchItemFailures: [] })
  expect(common.getMediaGroupMessages).not.toHaveBeenCalled()
  expect(common.getMultimodalMediaData).not.toHaveBeenCalled()
  expect(complete).toHaveBeenCalledTimes(1)
  expect(release).not.toHaveBeenCalled()
})

test('loads album media only when requested by the engaged loop', async () => {
  jest
    .spyOn(agent, 'runAgenticLoop')
    .mockImplementation(async (_message, _api, media, _botInfo, options) => {
      expect(media).toBeUndefined()
      expect(common.getMediaGroupMessages).not.toHaveBeenCalled()
      await options?.loadMedia?.()
    })
  expect(await worker(event, context)).toEqual({ batchItemFailures: [] })
  expect(common.getMediaGroupMessages).toHaveBeenCalledTimes(1)
  expect(common.getMultimodalMediaData).toHaveBeenCalledTimes(1)
})
