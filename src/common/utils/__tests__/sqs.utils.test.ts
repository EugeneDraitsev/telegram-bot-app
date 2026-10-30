import {
  ChangeMessageVisibilityCommand,
  type SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs'
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

const createSqsEvent = (
  ...records: Array<[string, unknown] | [string, unknown, string]>
) =>
  ({
    Records: records.map(([messageId, body, receiveCount = '1']) => ({
      messageId,
      receiptHandle: `receipt-${messageId}`,
      body: JSON.stringify(body),
      attributes: { ApproximateReceiveCount: receiveCount },
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:eu-central-1:123456789012:agent.fifo',
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

    // The worker re-downloads media from Telegram, so the payload must carry
    // the message verbatim — every file_id has to survive the round trip.
    const message = {
      message_id: 456,
      chat: { id: -123 },
      photo: [
        { file_id: 'small', file_unique_id: 'u', width: 100, height: 100 },
        { file_id: 'big', file_unique_id: 'u', width: 1000, height: 1000 },
      ],
      reply_to_message: {
        message_id: 455,
        video: { file_id: 'reply_video', file_unique_id: 'rv' },
      },
    }

    await enqueueAgentWorker({ message, commandName: 'q' })

    expect(capturedCommand?.input).toMatchObject({
      QueueUrl: 'https://sqs/agent.fifo',
      MessageGroupId: '-123',
      MessageDeduplicationId: 'agent:-123:456',
    })
    expect(JSON.parse(capturedCommand?.input.MessageBody ?? '')).toEqual({
      message,
      commandName: 'q',
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
    const capturedCommands: SendMessageCommand[] = []
    mockSqsSend((command) => {
      capturedCommands.push(command)
      return Promise.resolve({})
    })

    const payload = { message: { message_id: 8, chat: { id: 7 } } }
    await enqueueReplyWorker(payload)
    await enqueueReplyWorker(payload)

    expect(capturedCommands[0]?.input.QueueUrl).toBe(
      'http://localhost:9324/000000000000/telegram-local-reply-worker-jobs.fifo',
    )
    const firstDeduplicationId =
      capturedCommands[0]?.input.MessageDeduplicationId
    const secondDeduplicationId =
      capturedCommands[1]?.input.MessageDeduplicationId
    expect(firstDeduplicationId?.startsWith('reply:7:8:')).toBe(true)
    expect(secondDeduplicationId?.startsWith('reply:7:8:')).toBe(true)
    expect(secondDeduplicationId).not.toBe(firstDeduplicationId)
  })

  test('queues history-only bot media with the chat FIFO group and stable deduplication', async () => {
    let capturedCommand: SendMessageCommand | undefined
    mockSqsSend((command) => {
      capturedCommand = command
      return Promise.resolve({ MessageId: 'history-1' })
    })
    const payload = {
      message: {
        message_id: 11,
        chat: { id: 123 },
        caption: 'stats',
        photo: [{ file_id: 'stats-photo', file_unique_id: 'stats' }],
      },
      historyOnly: true,
    }

    await enqueueActivityWorker(payload)

    expect(capturedCommand?.input).toMatchObject({
      QueueUrl: 'https://sqs/activity.fifo',
      MessageGroupId: '123',
      MessageDeduplicationId: 'activity:123:11',
    })
    expect(JSON.parse(capturedCommand?.input.MessageBody ?? '')).toEqual(
      payload,
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
    const send = mockSqsSend(() => Promise.resolve({}))
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
    expect(send).toHaveBeenCalledTimes(1)
  })

  test('backs off a failed record instead of waiting out the queue timeout', async () => {
    const commands: unknown[] = []
    mockSqsSend((command) => {
      commands.push(command)
      return Promise.resolve({})
    })
    const fail = jest.fn(async () => {
      throw new Error('worker failed')
    })

    await handleSqsWorkerEvent(
      'agent',
      createSqsEvent(['message-1', {}, '1']),
      context,
      fail,
    )
    await handleSqsWorkerEvent(
      'agent',
      createSqsEvent(['message-2', {}, '4']),
      context,
      fail,
    )
    await handleSqsWorkerEvent(
      'agent',
      createSqsEvent(['message-3', {}, '9']),
      context,
      fail,
    )

    expect(commands[0]).toBeInstanceOf(ChangeMessageVisibilityCommand)
    expect(
      commands.map(
        (command) => (command as ChangeMessageVisibilityCommand).input,
      ),
    ).toEqual([
      {
        QueueUrl:
          'https://sqs.eu-central-1.amazonaws.com/123456789012/agent.fifo',
        ReceiptHandle: 'receipt-message-1',
        VisibilityTimeout: 30,
      },
      expect.objectContaining({ VisibilityTimeout: 240 }),
      expect.objectContaining({ VisibilityTimeout: 900 }),
    ])
  })

  test('still reports the failure when the backoff call fails', async () => {
    mockSqsSend(() => Promise.reject(new Error('sqs down')))

    await expect(
      handleSqsWorkerEvent(
        'reply',
        createSqsEvent(['message-1', {}]),
        context,
        async () => {
          throw new Error('worker failed')
        },
      ),
    ).resolves.toEqual({ batchItemFailures: [{ itemIdentifier: 'message-1' }] })
  })
})
