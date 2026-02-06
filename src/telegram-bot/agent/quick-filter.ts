/**
 * Step 1: Quick Filter (Cheap Model)
 * Quickly decides if the bot should engage with the message.
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { z } from 'zod'
import type { Message } from 'telegram-typings'

/**
 * Cheap model for quick filtering (low cost, fast)
 */
export const cheapModel = new ChatGoogleGenerativeAI({
  model: 'gemini-2.0-flash-lite',
  apiKey: process.env.GEMINI_API_KEY,
  temperature: 0,
})

/**
 * Filter tools for quick classification
 */
const filterTools = [
  new DynamicStructuredTool({
    name: 'engage',
    description:
      'The message requires a response from the bot. Use when the message is directed at the bot or needs attention.',
    schema: z.object({}),
    func: async () => ({ shouldEngage: true }),
  }),
  new DynamicStructuredTool({
    name: 'ignore',
    description:
      'Ignore the message. Use for normal user conversations not directed at the bot, spam, or when unsure. This is the DEFAULT.',
    schema: z.object({}),
    func: async () => ({ shouldEngage: false }),
  }),
]

const cheapModelWithTools = cheapModel.bindTools(filterTools)

/**
 * Quick filter using cheap model to decide ENGAGE or IGNORE
 */
export async function quickFilter(
  message: Message,
  imagesData?: Buffer[],
): Promise<boolean> {
  // Skip commands - they have their own handlers
  if (message.text?.startsWith('/')) {
    return false
  }

  // Get text content from message or caption
  const textContent = message.text || message.caption || ''

  // Skip very short messages without images
  if (textContent.length < 3 && !imagesData?.length) {
    return false
  }

  // Direct reply to bot - always engage
  if (message.reply_to_message?.from?.is_bot) {
    return true
  }

  try {
    const hasMedia = !!imagesData?.length || !!message.photo?.length
    const systemPrompt = `You are a quick filter for a Telegram group chat bot. Decide if the bot should engage with this message.

ENGAGE if:
- Message mentions the bot ("бот", "ботик", "ботяра", "bot", "ботан", etc)
- Message is a reply to the bot's previous message
- User is clearly asking the bot something
- Message has media (photo/image) with caption mentioning the bot

IGNORE (default) if:
- Normal conversation between users
- Spam or gibberish
- Unsure - when in doubt, ignore

Context:
- From: ${message.from?.first_name || 'Unknown'}
- Is reply to bot: ${message.reply_to_message?.from?.is_bot || false}
- Has media: ${hasMedia}
- Message: "${textContent}"`

    const result = await cheapModelWithTools.invoke([
      { role: 'system', content: systemPrompt },
      { role: 'human', content: textContent || '[media without text]' },
    ])

    const toolCalls = result.tool_calls
    if (toolCalls && toolCalls.length > 0) {
      return toolCalls[0].name === 'engage'
    }

    return false
  } catch (error) {
    console.error('Quick filter error:', error)
    return false
  }
}
