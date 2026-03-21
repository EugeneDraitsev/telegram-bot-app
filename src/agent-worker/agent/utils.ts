/**
 * Races a promise against a deadline. Rejects with the given error if the
 * promise does not settle within `ms` milliseconds.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  error: Error | string,
): Promise<T> {
  const rejectWith = typeof error === 'string' ? new Error(error) : error
  let handle: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        handle = setTimeout(() => reject(rejectWith), ms)
        // biome-ignore lint/suspicious/noExplicitAny: timer unref
        ;(handle as any).unref?.()
      }),
    ])
  } finally {
    if (handle) clearTimeout(handle)
  }
}
