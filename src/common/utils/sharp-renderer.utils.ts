import { getRequiredEnv } from './env.utils'
import { safeJSONParse } from './json.utils'
import { invokeLambda } from './lambda.utils'

/**
 * Invoke the sharp-renderer lambda and decode its base64 PNG body.
 * Throws with the renderer's own error message so callers can surface it.
 */
export async function renderSharpImage(
  payload: Record<string, unknown>,
  options: { customEndpoint?: boolean } = {},
): Promise<Buffer> {
  const response = await invokeLambda({
    name: getRequiredEnv('SHARP_RENDERER_FUNCTION_NAME'),
    customEndpoint: options.customEndpoint,
    payload,
  })

  if (response.FunctionError) {
    throw new Error(response.FunctionError)
  }

  const body = safeJSONParse(new TextDecoder().decode(response.Payload))
  if (body?.statusCode !== 200) {
    const error = safeJSONParse(body?.body)?.error
    throw new Error(
      typeof error === 'string' && error.trim()
        ? error.trim()
        : 'renderer failed',
    )
  }

  if (typeof body.body !== 'string') {
    throw new Error('renderer returned no image body')
  }

  const image = Buffer.from(body.body, 'base64')
  if (image.byteLength === 0) {
    throw new Error('renderer returned an empty image')
  }

  return image
}
