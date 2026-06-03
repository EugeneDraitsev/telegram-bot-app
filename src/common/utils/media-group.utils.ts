import type { Context } from 'grammy/web'
import type { Message } from 'telegram-typings'

import { getRawHistory } from '../upstash'
import { isAiEnabledChat } from './ai.utils'

const ALBUM_WAIT_MS = 4_000

const wait = (durationMs: number) =>
  new Promise((resolve) => setTimeout(resolve, durationMs))

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

  const chatId = ctx.chat?.id || 0
  if (!isAiEnabledChat(chatId)) {
    return []
  }

  const getRelatedMessages = async () =>
    (await getRawHistory(chatId)).filter((m) => {
      if (m.message_id === message.message_id) {
        return false
      }

      return (
        (currentMediaGroupId && m.media_group_id === currentMediaGroupId) ||
        (replyMediaGroupId && m.media_group_id === replyMediaGroupId)
      )
    })

  if (!currentMediaGroupId) {
    return getRelatedMessages()
  }

  await wait(ALBUM_WAIT_MS)
  return getRelatedMessages()
}
