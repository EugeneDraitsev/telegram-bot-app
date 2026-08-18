import { randomUUID } from 'node:crypto'
import {
  SendMessageCommand,
  type SendMessageCommandOutput,
  SQSClient,
} from '@aws-sdk/client-sqs'
import type { SQSBatchResponse, SQSEvent } from 'aws-lambda'

import { logger } from '../logger'
import { getOptionalEnv, getRequiredEnv } from './env.utils'

const WORKER_ENQUEUE_ACK_TIMEOUT_MS = 3_000
const LOCAL_SQS_ENDPOINT = 'http://localhost:9324'
const LOCAL_SQS_ACCOUNT_ID = '000000000000'

type WorkerName = 'activity' | 'agent' | 'reply'

interface WorkerQueueConfig {
  queueNameEnv: string
  queueUrlEnv: string
}

interface TelegramWorkerPayload {
  message?: {
    message_id?: number
    chat?: { id?: number }
  }
}

const queueConfig: Record<WorkerName, WorkerQueueConfig> = {
  activity: {
    queueNameEnv: 'ACTIVITY_WORKER_QUEUE_NAME',
    queueUrlEnv: 'ACTIVITY_WORKER_QUEUE_URL',
  },
  agent: {
    queueNameEnv: 'AGENT_WORKER_QUEUE_NAME',
    queueUrlEnv: 'AGENT_WORKER_QUEUE_URL',
  },
  reply: {
    queueNameEnv: 'REPLY_WORKER_QUEUE_NAME',
    queueUrlEnv: 'REPLY_WORKER_QUEUE_URL',
  },
}

const sqsClients = new Map<string, SQSClient>()

class WorkerEnqueueAckTimeoutError extends Error {
  constructor(
    readonly worker: WorkerName,
    readonly timeoutMs: number,
  ) {
    super(`Timed out enqueuing ${worker} worker after ${timeoutMs}ms`)
    this.name = 'WorkerEnqueueAckTimeoutError'
  }
}

function getSqsEndpoint(): string | undefined {
  if (process.env.IS_OFFLINE !== 'true') {
    return undefined
  }

  return getOptionalEnv('SQS_ENDPOINT') ?? LOCAL_SQS_ENDPOINT
}

function getSqsClient(): SQSClient {
  const endpoint = getSqsEndpoint()
  const region = process.env.region
  const key = `${region ?? ''}:${endpoint ?? ''}`
  const cached = sqsClients.get(key)
  if (cached) {
    return cached
  }

  const client = new SQSClient({
    region,
    endpoint,
    ...(endpoint
      ? {
          credentials: {
            accessKeyId: 'root',
            secretAccessKey: 'root',
          },
        }
      : {}),
  })
  sqsClients.set(key, client)
  return client
}

function getQueueUrl(config: WorkerQueueConfig): string {
  const endpoint = getSqsEndpoint()
  if (!endpoint) {
    return getRequiredEnv(config.queueUrlEnv)
  }

  const queueName = getRequiredEnv(config.queueNameEnv)
  const accountId = getOptionalEnv('SQS_ACCOUNT_ID') ?? LOCAL_SQS_ACCOUNT_ID
  return `${endpoint.replace(/\/$/, '')}/${accountId}/${queueName}`
}

function withEnqueueAckTimeout(
  promise: Promise<SendMessageCommandOutput>,
  worker: WorkerName,
  abortController: AbortController,
): Promise<SendMessageCommandOutput> {
  let timeout: ReturnType<typeof setTimeout> | undefined

  return new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      abortController.abort()
      reject(
        new WorkerEnqueueAckTimeoutError(worker, WORKER_ENQUEUE_ACK_TIMEOUT_MS),
      )
    }, WORKER_ENQUEUE_ACK_TIMEOUT_MS)

    promise.then(resolve, reject).finally(() => {
      if (timeout) {
        clearTimeout(timeout)
      }
    })
  })
}

// Payloads stay small: workers re-fetch media from Telegram by file_id.
function enqueueWorker<T extends TelegramWorkerPayload>(
  worker: WorkerName,
  payload: T,
): Promise<SendMessageCommandOutput> {
  const message = payload.message
  const chatId = message?.chat?.id
  const messageId = message?.message_id
  if (!chatId || !messageId) {
    throw new Error(`Cannot enqueue ${worker} worker without chat/message id`)
  }

  const config = queueConfig[worker]
  const abortController = new AbortController()
  const deduplicationId = `${worker}:${chatId}:${messageId}`
  const command = new SendMessageCommand({
    QueueUrl: getQueueUrl(config),
    MessageBody: JSON.stringify(payload),
    MessageGroupId: String(chatId),
    MessageDeduplicationId:
      process.env.IS_OFFLINE === 'true'
        ? `${deduplicationId}:${randomUUID()}`
        : deduplicationId,
  })
  const send = getSqsClient().send(command, {
    abortSignal: abortController.signal,
  })

  return withEnqueueAckTimeout(send, worker, abortController)
}

export const enqueueReplyWorker = <T extends TelegramWorkerPayload>(
  payload: T,
) => enqueueWorker('reply', payload)

export const enqueueAgentWorker = <T extends TelegramWorkerPayload>(
  payload: T,
) => enqueueWorker('agent', payload)

export const enqueueActivityWorker = <T extends TelegramWorkerPayload>(
  payload: T,
) => enqueueWorker('activity', payload)

function isSqsEvent<T>(event: T | SQSEvent): event is SQSEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'Records' in event &&
    Array.isArray(event.Records)
  )
}

export async function handleSqsWorkerEvent<T, R, TContext>(
  worker: WorkerName,
  event: T | SQSEvent,
  context: TContext,
  processPayload: (payload: T, context: TContext) => Promise<R>,
): Promise<R | SQSBatchResponse> {
  if (!isSqsEvent(event)) {
    return processPayload(event, context)
  }

  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = []
  for (const [index, record] of event.Records.entries()) {
    try {
      const payload = JSON.parse(record.body) as T
      await processPayload(payload, context)
    } catch (error) {
      logger.error(
        { error, worker, sqsMessageId: record.messageId },
        'sqs.worker_record_failed',
      )

      // Preserve FIFO order if batchSize is ever increased above one.
      batchItemFailures.push(
        ...event.Records.slice(index).map(({ messageId }) => ({
          itemIdentifier: messageId,
        })),
      )
      break
    }
  }

  return { batchItemFailures }
}
