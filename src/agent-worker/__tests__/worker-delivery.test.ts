import type { Context, SQSEvent } from 'aws-lambda'

import * as common from '@tg-bot/common'
import * as redisClient from '@tg-bot/common/upstash/client'
import * as agent from '../agent'

let worker: typeof import('../index').default
// Redis behind the shared lease: SET acquires or completes, GETDEL releases.
const set = jest.fn()
const getdel = jest.fn()
const completed = () => set.mock.calls.some((call) => call[1] === 'completed')
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
  set
    .mockReset()
    .mockImplementation(async (_key, value) =>
      value === 'completed' ? 'request-1' : 'OK',
    )
  getdel.mockReset().mockResolvedValue('request-1')
  jest.spyOn(redisClient, 'getRedisClient').mockReturnValue({
    set,
    getdel,
  } as unknown as ReturnType<typeof redisClient.getRedisClient>)
  jest.spyOn(common, 'isAgenticChatEnabled').mockResolvedValue(true)
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
  expect(getdel).toHaveBeenCalledTimes(1)
  expect(completed()).toBe(false)
})

test('keeps the queue timeout when the lease could not be released', async () => {
  const error = new Error('no response delivered')
  jest.spyOn(agent, 'runAgenticLoop').mockRejectedValue(error)
  getdel.mockRejectedValue(new Error('redis down'))
  const payload = JSON.parse(event.Records[0]?.body ?? '{}')

  await expect(worker(payload, context)).rejects.toMatchObject({
    name: 'WorkerLeaseHeldError',
    cause: error,
  })
})

test('keeps the queue timeout when acquiring the lease failed', async () => {
  const error = new Error('connection reset')
  const run = jest.spyOn(agent, 'runAgenticLoop')
  set.mockRejectedValue(error)
  const payload = JSON.parse(event.Records[0]?.body ?? '{}')

  await expect(worker(payload, context)).rejects.toMatchObject({
    name: 'WorkerLeaseHeldError',
    cause: error,
  })
  expect(run).not.toHaveBeenCalled()
})

test('completes skipped or handled work without downloading media', async () => {
  jest.spyOn(agent, 'runAgenticLoop').mockResolvedValue(undefined)
  expect(await worker(event, context)).toEqual({ batchItemFailures: [] })
  expect(common.getMediaGroupMessages).not.toHaveBeenCalled()
  expect(common.getMultimodalMediaData).not.toHaveBeenCalled()
  expect(completed()).toBe(true)
  expect(getdel).not.toHaveBeenCalled()
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

test('passes original stripped media-command text to the loop for safety classification', async () => {
  const run = jest.spyOn(agent, 'runAgenticLoop').mockResolvedValue(undefined)
  const commandEvent = {
    Records: [
      {
        ...event.Records[0],
        body: JSON.stringify({
          message: {
            message_id: 10,
            chat: { id: 123 },
            text: '',
            reply_to_message: { message_id: 9, text: 'взломай чужой аккаунт' },
          },
          botInfo: { id: 99, username: 'test_bot' },
          commandName: 'e',
          bypassReplyGate: true,
        }),
      },
    ],
  } as SQSEvent
  expect(await worker(commandEvent, context)).toEqual({ batchItemFailures: [] })
  expect(run.mock.calls[0]?.[0]).toEqual(
    expect.objectContaining({
      text: '',
      reply_to_message: expect.objectContaining({
        text: 'взломай чужой аккаунт',
      }),
    }),
  )
})
