import type { Message } from 'telegram-typings'

import {
  collectMessageImageFileIds,
  getLargestPhoto,
  getMediaGroupMessagesFromHistory,
} from '@tg-bot/common'

const MEDIA_GROUP_RETRY_DELAY_MS = 1_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function collectMediaGroupImageFileIds(
  message: Message,
): Promise<string[]> {
  const chatId = message.chat?.id
  const messageId = message.message_id
  if (!chatId || !messageId) {
    return []
  }

  const currentMediaGroupId = message.media_group_id
  const replyMediaGroupId = message.reply_to_message?.media_group_id
  if (!currentMediaGroupId && !replyMediaGroupId) {
    return []
  }

  let mediaGroupMessages = await getMediaGroupMessagesFromHistory(
    chatId,
    messageId,
    currentMediaGroupId,
    replyMediaGroupId,
    true,
  )

  // Reply-to-media-group can race with history persistence.
  // Retry once after a short delay when the first read is empty.
  if (
    !currentMediaGroupId &&
    replyMediaGroupId &&
    mediaGroupMessages.length === 0
  ) {
    await sleep(MEDIA_GROUP_RETRY_DELAY_MS)
    mediaGroupMessages = await getMediaGroupMessagesFromHistory(
      chatId,
      messageId,
      currentMediaGroupId,
      replyMediaGroupId,
      false,
    )
  }

  return mediaGroupMessages
    .map((m) => getLargestPhoto(m)?.file_id)
    .filter((id): id is string => Boolean(id))
}

export async function collectEffectiveImageFileIds(
  message: Message,
  incomingFileIds?: string[],
): Promise<string[]> {
  const directImageFileIds = collectMessageImageFileIds(
    message,
    incomingFileIds,
  )
  const mediaGroupImageFileIds = await collectMediaGroupImageFileIds(message)

  return [...new Set([...directImageFileIds, ...mediaGroupImageFileIds])]
}
