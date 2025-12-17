import type { Context } from 'grammy/web'
import type { Message } from 'telegram-typings'

import { getRawHistory } from '../upstash'

const ALBUM_WAIT_DELAY_MS = 1_000

export const getMediaGroupMessages = async (
  ctx: Context,
): Promise<Message[]> => {
  const message = ctx.message
  if (!message) {
    return []
  }

  const currentMediaGroupId = message.media_group_id
  const replyMediaGroupId = message.reply_to_message?.media_group_id

  if (!currentMediaGroupId && !replyMediaGroupId) {
    return []
  }

  // If the current message is part of an album, we need to wait for other parts
  // of the album to be processed and saved to the history by concurrent Lambda executions.
  if (currentMediaGroupId) {
    await new Promise((resolve) => setTimeout(resolve, ALBUM_WAIT_DELAY_MS))
  }

  const history = await getRawHistory(ctx.chat?.id || 0)

  return history.filter((m) => {
    // Exclude the current message itself from "extra" to avoid redundancy
    // (though deduplication handles it, it's cleaner)
    if (m.message_id === message.message_id) {
      return false
    }

    if (currentMediaGroupId && m.media_group_id === currentMediaGroupId) {
      return true
    }
    if (replyMediaGroupId && m.media_group_id === replyMediaGroupId) {
      return true
    }

    return false
  })
}
