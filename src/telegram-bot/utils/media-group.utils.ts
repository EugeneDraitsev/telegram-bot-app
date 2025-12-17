import type { Context } from 'grammy/web'
import type { Message } from 'telegram-typings'

import { getRawHistory } from '../upstash'

export const getMediaGroupMessages = async (
  ctx: Context,
): Promise<Message[]> => {
  const mediaGroupId = ctx.message?.media_group_id
  if (!mediaGroupId) {
    return []
  }

  const history = await getRawHistory(ctx.chat?.id || 0)
  return history.filter(
    (m) =>
      m.media_group_id === mediaGroupId &&
      m.message_id !== ctx.message?.message_id,
  )
}
