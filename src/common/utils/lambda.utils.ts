import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

import { safeJSONParse } from './json.utils'

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

type InvokeForResultOptions = Omit<InvokeLambdaOptions, 'async'> & {
  label: string
}

/**
 * Invoke a lambda and return its response body, surfacing the callee's own
 * error message so callers can report why the work failed.
 */
async function invokeLambdaForBody({
  label,
  ...options
}: InvokeForResultOptions): Promise<string> {
  const response = await invokeLambda(options)

  if (response.FunctionError) {
    throw new Error(response.FunctionError)
  }

  const body = safeJSONParse(new TextDecoder().decode(response.Payload))
  if (body?.statusCode !== 200) {
    const error = safeJSONParse(body?.body)?.error
    throw new Error(
      typeof error === 'string' && error.trim()
        ? error.trim()
        : `${label} failed`,
    )
  }

  if (typeof body.body !== 'string') {
    throw new Error(`${label} returned no body`)
  }

  return body.body
}

/** Invoke a lambda that answers with a base64 body and decode it. */
export async function invokeLambdaForBuffer(
  options: InvokeForResultOptions,
): Promise<Buffer> {
  const result = Buffer.from(await invokeLambdaForBody(options), 'base64')
  if (result.byteLength === 0) {
    throw new Error(`${options.label} returned an empty body`)
  }

  return result
}

/** Invoke a lambda that answers with a JSON body and parse it. */
export async function invokeLambdaForJson<T>(
  options: InvokeForResultOptions,
): Promise<T> {
  const parsed = safeJSONParse(await invokeLambdaForBody(options))
  if (!parsed) {
    throw new Error(`${options.label} returned an unreadable body`)
  }

  return parsed as T
}
