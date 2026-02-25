import type { Message } from 'telegram-typings'

import { getLargestPhoto } from './telegram.utils'

/**
 * Collect file IDs from a message and its reply context.
 * Returns unique values only.
 */
export function collectMessageImageFileIds(
  message: Message,
  initialFileIds: string[] = [],
): string[] {
  const ids = [
    ...initialFileIds,
    getLargestPhoto(message)?.file_id,
    getLargestPhoto(message.reply_to_message)?.file_id,
    message.reply_to_message?.sticker?.file_id,
  ].filter((id): id is string => Boolean(id))

  return [...new Set(ids)]
}
