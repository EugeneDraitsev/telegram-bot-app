import { type SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import type { Context, SQSEvent } from 'aws-lambda'

import {
  enqueueActivityWorker,
  enqueueAgentWorker,
  enqueueReplyWorker,
  handleSqsWorkerEvent,
} from '..'

type SqsSend = SQSClient['send']

const mockSqsSend = (
  implementation: (this: SQSClient, command: SendMessageCommand) => unknown,
) =>
  jest
    .spyOn(SQSClient.prototype, 'send')
    .mockImplementation(implementation as unknown as SqsSend)

const createSqsEvent = (...records: Array<[string, unknown]>) =>
  ({
    Records: records.map(([messageId, body]) => ({
      messageId,
      body: JSON.stringify(body),
      eventSource: 'aws:sqs',
    })),
  }) as SQSEvent

describe('worker queue producers', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      IS_OFFLINE: 'false',
      region: 'eu-central-1',
      ACTIVITY_WORKER_QUEUE_URL: 'https://sqs/activity.fifo',
      AGENT_WORKER_QUEUE_URL: 'https://sqs/agent.fifo',
      REPLY_WORKER_QUEUE_URL: 'https://sqs/reply.fifo',
    }
  })

  afterEach(() => {
    process.env = originalEnv
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  test('enqueues a FIFO job grouped and deduplicated by Telegram message', async () => {
    let capturedCommand: SendMessageCommand | undefined
    mockSqsSend((command) => {
      capturedCommand = command
      return Promise.resolve({ MessageId: 'sqs-1' })
    })

    await enqueueAgentWorker({
      message: { message_id: 456, chat: { id: -123 } },
      imagesData: [Buffer.from('large image')],
      imageInputs: [{ data: Buffer.from('another image') }],
    })

    expect(capturedCommand?.input).toMatchObject({
      QueueUrl: 'https://sqs/agent.fifo',
      MessageGroupId: '-123',
      MessageDeduplicationId: 'agent:-123:456',
    })
    expect(JSON.parse(capturedCommand?.input.MessageBody ?? '')).toEqual({
      message: { message_id: 456, chat: { id: -123 } },
    })
  })

  test('uses the local ElasticMQ queue URL offline', async () => {
    process.env = {
      ...process.env,
      IS_OFFLINE: 'true',
      SQS_ENDPOINT: 'http://localhost:9324',
      SQS_ACCOUNT_ID: '000000000000',
      REPLY_WORKER_QUEUE_NAME: 'telegram-local-reply-worker-jobs.fifo',
    }
    let capturedCommand: SendMessageCommand | undefined
    mockSqsSend((command) => {
      capturedCommand = command
      return Promise.resolve({})
    })

    await enqueueReplyWorker({
      message: { message_id: 8, chat: { id: 7 } },
    })

    expect(capturedCommand?.input.QueueUrl).toBe(
      'http://localhost:9324/000000000000/telegram-local-reply-worker-jobs.fifo',
    )
  })

  test('rejects a job without chat and message ids', () => {
    expect(() => enqueueActivityWorker({})).toThrow(
      'Cannot enqueue activity worker without chat/message id',
    )
  })

  test('times out when SQS SendMessage ACK hangs', async () => {
    jest.useFakeTimers()
    mockSqsSend(() => new Promise(() => undefined))

    const result = enqueueActivityWorker({
      message: { message_id: 8, chat: { id: 7 } },
    })
    jest.advanceTimersByTime(3_000)

    await expect(result).rejects.toThrow(
      'Timed out enqueuing activity worker after 3000ms',
    )
  })
})

describe('handleSqsWorkerEvent', () => {
  const context = { awsRequestId: 'request-1' } as Context

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('keeps direct handler invocation compatible', async () => {
    const processPayload = jest.fn(async (payload: { value: number }) =>
      String(payload.value),
    )

    await expect(
      handleSqsWorkerEvent('agent', { value: 42 }, context, processPayload),
    ).resolves.toBe('42')
  })

  test('parses and processes an SQS record', async () => {
    const processPayload = jest.fn(async () => undefined)

    await expect(
      handleSqsWorkerEvent(
        'reply',
        createSqsEvent(['message-1', { value: 42 }]),
        context,
        processPayload,
      ),
    ).resolves.toEqual({ batchItemFailures: [] })
    expect(processPayload).toHaveBeenCalledWith({ value: 42 }, context)
  })

  test('marks a failed FIFO record and all following records for retry', async () => {
    const processPayload = jest.fn(async () => {
      throw new Error('worker failed')
    })

    await expect(
      handleSqsWorkerEvent(
        'activity',
        createSqsEvent(
          ['message-1', { value: 1 }],
          ['message-2', { value: 2 }],
        ),
        context,
        processPayload,
      ),
    ).resolves.toEqual({
      batchItemFailures: [
        { itemIdentifier: 'message-1' },
        { itemIdentifier: 'message-2' },
      ],
    })
    expect(processPayload).toHaveBeenCalledTimes(1)
  })
})
