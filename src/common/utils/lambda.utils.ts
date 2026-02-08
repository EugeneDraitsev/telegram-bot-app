import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

export const invokeLambda = (
  name: string,
  // biome-ignore lint: we can pass any payload here
  payload: Record<string, any>,
  customEndpoint = false,
) => {
  const isOffline = process.env.IS_OFFLINE === 'true'

  const lambda = new LambdaClient({
    region: process.env.region,
    endpoint: isOffline && customEndpoint ? 'http://localhost:3002' : undefined,
  })

  return lambda.send(
    new InvokeCommand({
      FunctionName: name,
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  )
}

// biome-ignore lint: we can pass any payload here
export const invokeReplyLambda = (payload: Record<string, any>) => {
  const replyWorkerFunctionName = process.env.REPLY_WORKER_FUNCTION_NAME || ''

  // Remove imagesData from payload to avoid exceeding Lambda's 6MB payload limit.
  // The worker lambda will re-fetch images from Telegram API when processing the command.
  const { imagesData, ...payloadWithoutImages } = payload

  return invokeLambda(replyWorkerFunctionName, payloadWithoutImages, true)
}

// biome-ignore lint: we can pass any payload here
export const invokeAgentLambda = (payload: Record<string, any>) => {
  const agentWorkerFunctionName = process.env.AGENT_WORKER_FUNCTION_NAME || ''
  if (!agentWorkerFunctionName) {
    throw new Error('AGENT_WORKER_FUNCTION_NAME is not set')
  }

  // Remove imagesData from payload to avoid exceeding Lambda's 6MB payload limit.
  // The worker lambda will re-fetch images from Telegram API when processing.
  const { imagesData, ...payloadWithoutImages } = payload

  return invokeLambda(agentWorkerFunctionName, payloadWithoutImages, true)
}
