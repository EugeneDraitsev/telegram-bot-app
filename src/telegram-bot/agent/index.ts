/**
 * Smart Agentic Bot with autonomous tool calling.
 *
 * Architecture (2-level with async processing):
 * 1. Quick Filter (cheap model) - decides ENGAGE or IGNORE (sync, fast)
 * 2. Agent Worker Lambda (async) - runs agentic loop with tools
 *
 * After quick filter passes, we invoke Lambda async and return 200 OK immediately.
 * This ensures Telegram doesn't timeout waiting for response.
 */

import type { Context } from 'grammy'
import type { Message } from 'telegram-typings'

import { findCommand, invokeAgentLambda } from '@tg-bot/common'
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
  _ctx: Context,
  imagesData?: Buffer[],
): Promise<void> {
  if (findCommand(message.text)) {
    return
  }

  // Step 1: Quick filter (cheap model) - this is fast
  const passedQuickFilter = await quickFilter(message, imagesData)

  if (!passedQuickFilter) {
    return
  }

  // Step 2: Invoke agent worker Lambda async (don't wait for response)
  // This returns immediately, allowing us to send 200 OK to Telegram
  const payload: AgentPayload = {
    message,
    imageFileIds: collectImageFileIds(message),
  }

  invokeAgentLambda(payload)

  // Return immediately - worker will handle the response
}
