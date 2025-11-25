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

  return invokeLambda(replyWorkerFunctionName, payload, true)
}
