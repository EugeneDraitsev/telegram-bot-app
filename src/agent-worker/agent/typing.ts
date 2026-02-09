import { logger } from '../logger'
import type { TelegramApi } from '../types'
import { TYPING_PING_INTERVAL_MS } from './config'

export function startTyping(api: TelegramApi, chatId: number) {
  if (!api.sendChatAction) {
    return () => {}
  }

  let stopped = false
  const ping = () =>
    api.sendChatAction?.(chatId, 'typing').catch((error) =>
      logger.warn(
        {
          chatId,
          error,
        },
        'typing.failed',
      ),
    )

  ping()
  const interval = setInterval(ping, TYPING_PING_INTERVAL_MS)
  interval.unref?.()

  return () => {
    if (stopped) {
      return
    }

    stopped = true
    clearInterval(interval)
  }
}
