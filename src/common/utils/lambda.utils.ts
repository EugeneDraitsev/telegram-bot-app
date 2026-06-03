import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

import { getRequiredEnv } from './env.utils'

interface InvokeLambdaOptions {
  name: string
  // biome-ignore lint: we can pass any payload here
  payload: Record<string, any>
  customEndpoint?: boolean
  async?: boolean
}

export const invokeLambda = ({
  name,
  payload,
  customEndpoint = false,
  async: isAsync = false,
}: InvokeLambdaOptions) => {
  const isOffline = process.env.IS_OFFLINE === 'true'

  const lambda = new LambdaClient({
    region: process.env.region,
    endpoint: isOffline && customEndpoint ? 'http://localhost:3002' : undefined,
  })

  return lambda.send(
    new InvokeCommand({
      FunctionName: name,
      Payload: Buffer.from(JSON.stringify(payload)),
      ...(isAsync ? { InvocationType: 'Event' } : {}),
    }),
  )
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
