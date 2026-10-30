import { Bot } from 'grammy/web'
import type { Context as LambdaContext } from 'aws-lambda'
import type { Update } from 'grammy/types'

import * as common from '@tg-bot/common'
import { processTelegramReply } from '../telegram-reply-worker'

const update = {
  update_id: 1,
  message: { message_id: 10, date: 1, chat: { id: 123, type: 'private' } },
} as Update
const context = { awsRequestId: 'request-1' } as LambdaContext

describe('telegram reply worker', () => {
  let handleUpdate: jest.SpyInstance

  beforeEach(() => {
    jest.spyOn(Bot.prototype, 'init').mockResolvedValue(undefined)
    handleUpdate = jest.spyOn(Bot.prototype, 'handleUpdate')
    jest
      .spyOn(common, 'runIdempotentWorkerTask')
      .mockImplementation(async ({ task }) => ({
        duplicate: false,
        value: await task(),
      }))
    jest.spyOn(common.logger, 'warn').mockImplementation(() => {})
    jest.spyOn(common.logger, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('completes a command Telegram permanently rejects', async () => {
    handleUpdate.mockRejectedValue({
      error: {
        error_code: 400,
        description: 'Bad Request: message to be replied not found',
      },
    })

    await expect(processTelegramReply(update, context)).resolves.toEqual({
      statusCode: 200,
      body: 'OK',
    })
  })

  test('rethrows transient failures so SQS retries them', async () => {
    const error = { error: { error_code: 502 } }
    handleUpdate.mockRejectedValue(error)

    await expect(processTelegramReply(update, context)).rejects.toBe(error)
  })
})
