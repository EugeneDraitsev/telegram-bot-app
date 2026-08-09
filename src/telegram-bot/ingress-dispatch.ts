import type { APIGatewayProxyResult } from 'aws-lambda'

export async function waitForIngressDispatch(
  tasks: Promise<unknown>[],
): Promise<void> {
  const results = await Promise.allSettled(tasks)
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  )

  if (failures.length > 0) {
    throw new AggregateError(failures, 'Ingress dispatch failed')
  }
}

export async function respondToWebhookDispatch(
  dispatch: () => Promise<unknown>,
  onError: (error: unknown) => void,
): Promise<APIGatewayProxyResult> {
  try {
    await dispatch()
    return { statusCode: 200, body: '' }
  } catch (error) {
    onError(error)
    return {
      body: '',
      // Let Telegram retry. Worker idempotency makes a repeated update safe when
      // one async invoke succeeded and another dispatch failed.
      statusCode: 503,
    }
  }
}
