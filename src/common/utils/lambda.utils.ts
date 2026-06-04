import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

import { getRequiredEnv } from './env.utils'

const WORKER_INVOKE_ACK_TIMEOUT_MS = 3_000
const lambdaClients = new Map<string, LambdaClient>()

interface InvokeLambdaOptions {
  name: string
  // biome-ignore lint: we can pass any payload here
  payload: Record<string, any>
  customEndpoint?: boolean
  async?: boolean
  ackTimeoutMs?: number
}

class LambdaInvokeAckTimeoutError extends Error {
  constructor(
    readonly functionName: string,
    readonly timeoutMs: number,
  ) {
    super(`Timed out invoking ${functionName} after ${timeoutMs}ms`)
    this.name = 'LambdaInvokeAckTimeoutError'
  }
}

function getLambdaEndpoint(customEndpoint: boolean): string | undefined {
  const isOffline = process.env.IS_OFFLINE === 'true'
  return isOffline && customEndpoint ? 'http://localhost:3002' : undefined
}

function getLambdaClient(customEndpoint: boolean): LambdaClient {
  const region = process.env.region
  const endpoint = getLambdaEndpoint(customEndpoint)
  const key = `${region ?? ''}:${endpoint ?? ''}`
  const cached = lambdaClients.get(key)
  if (cached) {
    return cached
  }

  const lambda = new LambdaClient({ region, endpoint })
  lambdaClients.set(key, lambda)
  return lambda
}

function withInvokeAckTimeout<T>(
  promise: Promise<T>,
  functionName: string,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined

  return new Promise<T>((resolve, reject) => {
    timeout = setTimeout(() => {
      onTimeout()
      reject(new LambdaInvokeAckTimeoutError(functionName, timeoutMs))
    }, timeoutMs)

    promise.then(resolve, reject).finally(() => {
      if (timeout) {
        clearTimeout(timeout)
      }
    })
  })
}

export const invokeLambda = ({
  name,
  payload,
  customEndpoint = false,
  async: isAsync = false,
  ackTimeoutMs,
}: InvokeLambdaOptions) => {
  const lambda = getLambdaClient(customEndpoint)
  const abortController = ackTimeoutMs ? new AbortController() : undefined
  const command = new InvokeCommand({
    FunctionName: name,
    Payload: Buffer.from(JSON.stringify(payload)),
    ...(isAsync ? { InvocationType: 'Event' } : {}),
  })

  const invoke = lambda.send(
    command,
    abortController ? { abortSignal: abortController.signal } : undefined,
  )

  return ackTimeoutMs
    ? withInvokeAckTimeout(invoke, name, ackTimeoutMs, () =>
        abortController?.abort(),
      )
    : invoke
}

// Remove inline image buffers from async invokes; Lambda Event payloads are capped at 256 KB.
// The worker lambda will re-fetch images from Telegram API when processing.
// biome-ignore lint: we can pass any payload here
const stripLargeFields = (payload: Record<string, any>) => {
  const { imagesData, imageInputs, ...rest } = payload
  return rest
}

const invokeWorkerLambda = (
  envKey: string,
  // biome-ignore lint: we can pass any payload here
  payload: Record<string, any>,
) => {
  return invokeLambda({
    name: getRequiredEnv(envKey),
    payload: stripLargeFields(payload),
    customEndpoint: true,
    async: true,
    ackTimeoutMs: WORKER_INVOKE_ACK_TIMEOUT_MS,
  })
}

// biome-ignore lint: we can pass any payload here
export const invokeReplyLambda = (payload: Record<string, any>) =>
  invokeWorkerLambda('REPLY_WORKER_FUNCTION_NAME', payload)

// biome-ignore lint: we can pass any payload here
export const invokeAgentLambda = (payload: Record<string, any>) =>
  invokeWorkerLambda('AGENT_WORKER_FUNCTION_NAME', payload)

// biome-ignore lint: we can pass any payload here
export const invokeActivityLambda = (payload: Record<string, any>) =>
  invokeWorkerLambda('ACTIVITY_WORKER_FUNCTION_NAME', payload)
