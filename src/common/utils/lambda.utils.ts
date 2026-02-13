import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

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

// Remove imagesData from payload to avoid exceeding Lambda's 6MB payload limit.
// The worker lambda will re-fetch images from Telegram API when processing.
// biome-ignore lint: we can pass any payload here
const stripLargeFields = (payload: Record<string, any>) => {
  const { imagesData, ...rest } = payload
  return rest
}

// biome-ignore lint: we can pass any payload here
export const invokeReplyLambda = (payload: Record<string, any>) => {
  const replyWorkerFunctionName = process.env.REPLY_WORKER_FUNCTION_NAME || ''
  return invokeLambda({
    name: replyWorkerFunctionName,
    payload: stripLargeFields(payload),
    customEndpoint: true,
    async: true,
  })
}

// biome-ignore lint: we can pass any payload here
export const invokeAgentLambda = (payload: Record<string, any>) => {
  const agentWorkerFunctionName = process.env.AGENT_WORKER_FUNCTION_NAME || ''
  if (!agentWorkerFunctionName) {
    throw new Error('AGENT_WORKER_FUNCTION_NAME is not set')
  }
  return invokeLambda({
    name: agentWorkerFunctionName,
    payload: stripLargeFields(payload),
    customEndpoint: true,
    async: true,
  })
}
