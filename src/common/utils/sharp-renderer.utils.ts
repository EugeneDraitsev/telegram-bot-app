import { getRequiredEnv } from './env.utils'
import { invokeLambdaForBuffer } from './lambda.utils'

/**
 * Invoke the sharp-renderer lambda and decode its base64 PNG body.
 * Throws with the renderer's own error message so callers can surface it.
 */
export async function renderSharpImage(
  payload: Record<string, unknown>,
  options: { customEndpoint?: boolean } = {},
): Promise<Buffer> {
  return invokeLambdaForBuffer({
    label: 'renderer',
    name: getRequiredEnv('SHARP_RENDERER_FUNCTION_NAME'),
    customEndpoint: options.customEndpoint,
    payload,
  })
}
