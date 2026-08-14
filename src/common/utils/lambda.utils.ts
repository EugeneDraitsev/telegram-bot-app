import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

const lambdaClients = new Map<string, LambdaClient>()

interface InvokeLambdaOptions {
  name: string
  payload: Record<string, unknown>
  customEndpoint?: boolean
  async?: boolean
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

export const invokeLambda = ({
  name,
  payload,
  customEndpoint = false,
  async: isAsync = false,
}: InvokeLambdaOptions) => {
  const lambda = getLambdaClient(customEndpoint)
  const command = new InvokeCommand({
    FunctionName: name,
    Payload: Buffer.from(JSON.stringify(payload)),
    ...(isAsync ? { InvocationType: 'Event' } : {}),
  })

  return lambda.send(command)
}
