/**
 * Reaction + typing indicator for AI command handlers.
 * Sets an emoji reaction on the command message and starts a periodic typing indicator.
 */

import type { Context } from 'grammy/web'

import { startTypingIndicator } from './typing.utils'

/** Default reaction emoji for AI commands (robot face) */
export const AI_COMMAND_REACTION = '🤖'

/** Default reaction emoji for agentic bot */
export const AGENT_REACTION = '👀'

/**
 * Set emoji reaction on a message and start a periodic "typing" indicator.
 * Returns a `stop` function that clears the typing interval.
 *
 * Errors are silently caught so callers don't need try/catch.
 */
export function startCommandReaction(
  ctx: Context,
  emoji: string = AI_COMMAND_REACTION,
) {
  const chatId = ctx.chat?.id
  const messageId = ctx.message?.message_id

  if (!chatId || !messageId) {
    return () => {}
  }

  try {
    // Set reaction (fire-and-forget)
    void ctx.api
      // biome-ignore lint/suspicious/noExplicitAny: emoji union type workaround
      .setMessageReaction(chatId, messageId, [{ type: 'emoji', emoji } as any])
      .catch(() => undefined)
  } catch {
    // Ignore reaction errors
  }

  let stopTyping = () => {}
  try {
    stopTyping = startTypingIndicator({
      chatId,
      sendChatAction: (id, action) => ctx.api.sendChatAction(id, action),
    })
  } catch {
    // Ignore typing init errors
  }

  return () => {
    try {
      stopTyping()
    } catch {
      // Ignore typing stop errors
    }
  }
}
