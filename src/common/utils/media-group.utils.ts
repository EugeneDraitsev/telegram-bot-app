/**
 * Media group utilities for filtering messages by media_group_id
 * Shared between telegram-bot and agent-worker
 */

import type { Context } from 'grammy/web'
import type { Message } from 'telegram-typings'

import { getRawHistory } from '../upstash'

const ALBUM_WAIT_DELAY_MS = 1_000
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Get messages from the same media group (album)
 * @param chatId - Chat ID to get history from
 * @param currentMessageId - Current message ID to exclude
 * @param currentMediaGroupId - Media group ID of current message
 * @param replyMediaGroupId - Media group ID of replied message (if any)
 * @param waitForAlbum - If true, waits for album to be fully uploaded
 */
export async function getMediaGroupMessagesFromHistory(
  chatId: number | string,
  currentMessageId: number,
  currentMediaGroupId?: string,
  replyMediaGroupId?: string,
  waitForAlbum = true,
): Promise<Message[]> {
  if (!currentMediaGroupId && !replyMediaGroupId) {
    return []
  }

  // If the current message is part of an album, we need to wait for other parts
  // of the album to be processed and saved to the history by concurrent Lambda executions.
  if (currentMediaGroupId && waitForAlbum) {
    await sleep(ALBUM_WAIT_DELAY_MS)
  }

  return filterMediaGroupMessages(
    await getRawHistory(chatId),
    currentMessageId,
    currentMediaGroupId,
    replyMediaGroupId,
  )
}

/**
 * Filter messages by media group ID
 */
export function filterMediaGroupMessages(
  messages: Message[],
  currentMessageId: number,
  currentMediaGroupId?: string,
  replyMediaGroupId?: string,
): Message[] {
  return messages.filter((m) => {
    // Exclude the current message itself from "extra" to avoid redundancy
    if (m.message_id === currentMessageId) {
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

/**
 * Get messages from the same media group (album) using grammy Context
 */
export async function getMediaGroupMessages(ctx: Context): Promise<Message[]> {
  const message = ctx.message as Message | undefined
  if (!message) {
    return []
  }

  return getMediaGroupMessagesFromHistory(
    ctx.chat?.id || 0,
    message.message_id,
    message.media_group_id,
    message.reply_to_message?.media_group_id,
  )
}
