export const TYPING_PING_INTERVAL_MS = 4000

type SendTypingAction = (chatId: number, action: 'typing') => Promise<unknown>

export function startTypingIndicator(params: {
  chatId: number
  sendChatAction?: SendTypingAction
  intervalMs?: number
  onError?: (error: unknown) => void
}) {
  const {
    chatId,
    sendChatAction,
    intervalMs = TYPING_PING_INTERVAL_MS,
    onError,
  } = params

  if (!sendChatAction) {
    return () => {}
  }

  const reportError = (error: unknown) => {
    try {
      onError?.(error)
    } catch {
      // Ignore telemetry/reporting errors
    }
  }

  let stopped = false
  const ping = () => {
    try {
      void sendChatAction(chatId, 'typing').catch((error) => reportError(error))
    } catch (error) {
      reportError(error)
    }
  }

  try {
    ping()
    const interval = setInterval(ping, intervalMs)
    interval.unref?.()

    return () => {
      if (stopped) {
        return
      }

      stopped = true
      clearInterval(interval)
    }
  } catch (error) {
    reportError(error)
    return () => {}
  }
}
