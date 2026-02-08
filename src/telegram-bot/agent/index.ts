import type { Context } from 'grammy/web'
import type { Message } from 'telegram-typings'

import { invokeAgentLambda, isAgenticChatEnabled } from '@tg-bot/common'
import { quickFilter } from './quick-filter'

export interface AgentPayload {
  message: Message
  imageFileIds?: string[]
}

const getLargestPhotoFileId = (msg?: Message) =>
  (msg?.photo ?? []).slice().sort((a, b) => b.width - a.width)[0]?.file_id

function collectImageFileIds(message: Message): string[] {
  const ids = [
    getLargestPhotoFileId(message),
    getLargestPhotoFileId(message.reply_to_message),
    message.reply_to_message?.sticker?.file_id,
  ].filter((id): id is string => Boolean(id))

  return [...new Set(ids)]
}

/**
 * Main entry point for handling messages with the agent.
 * Returns quickly after invoking Lambda async.
 */
export async function handleMessageWithAgent(
  message: Message,
  ctx: Context,
  imagesData?: Buffer[],
): Promise<void> {
  const chatId = message.chat?.id
  if (!chatId || !(await isAgenticChatEnabled(chatId))) {
    return
  }

  // Step 1: Quick filter (cheap model) - this is fast
  const passedQuickFilter = await quickFilter(message, imagesData)

  if (!passedQuickFilter) {
    return
  }

  void ctx.api
    .setMessageReaction(chatId, message.message_id, [
      { type: 'emoji', emoji: '👀' },
    ])
    .catch(() => undefined)

  // Step 2: Invoke agent worker Lambda async (don't wait for response)
  // This returns immediately, allowing us to send 200 OK to Telegram
  const payload: AgentPayload = {
    message,
    imageFileIds: collectImageFileIds(message),
  }

  invokeAgentLambda(payload)

  // Return immediately - worker will handle the response
}
