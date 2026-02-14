/**
 * Step 1: Quick Filter (Cheap Model)
 * Quickly decides if the bot should engage with the message.
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { z } from 'zod'
import type { Message } from 'telegram-typings'

import { getChatMemory, getGlobalMemory } from '@tg-bot/common'

export interface BotInfo {
  id: number
  username?: string
}

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

/**
 * Cheap model for quick filtering (low cost, fast)
 */
const createCheapModelWithTools = () =>
  new ChatGoogleGenerativeAI({
    model: 'gemini-2.0-flash-lite',
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  }).bindTools(filterTools)

let cheapModelWithTools: ReturnType<
  ChatGoogleGenerativeAI['bindTools']
> | null = null

const getCheapModelWithTools = () => {
  if (!cheapModelWithTools) {
    cheapModelWithTools = createCheapModelWithTools()
  }
  return cheapModelWithTools
}

/**
 * Check if message mentions another bot (not ours)
 */
function mentionsOtherBot(text: string, ourBotUsername?: string): boolean {
  // Find all @username mentions that look like bots (ending with 'bot')
  const botMentionRegex = /@(\w+bot)\b/gi
  const matches = text.match(botMentionRegex)
  if (!matches) return false

  const ourUsername = ourBotUsername?.toLowerCase()
  return matches.some((mention) => {
    const username = mention.slice(1).toLowerCase() // remove @
    return username !== ourUsername
  })
}

/**
 * Quick filter using cheap model to decide ENGAGE or IGNORE
 */
export async function quickFilter(
  message: Message,
  imagesData?: Buffer[],
  botInfo?: BotInfo,
): Promise<boolean> {
  // Get text content from message or caption
  const textContent = message.text || message.caption || ''
  const normalizedText = textContent.trimStart()

  // Unknown slash-command should be treated as direct bot request
  if (normalizedText.startsWith('/')) {
    return true
  }

  // Skip very short messages without images
  if (textContent.length < 3 && !imagesData?.length) {
    return false
  }

  // Direct reply to OUR bot - always engage
  // If replying to another bot - skip
  const replyFrom = message.reply_to_message?.from
  if (replyFrom?.is_bot) {
    if (botInfo?.id && replyFrom.id === botInfo.id) {
      return true
    }
    // Reply to another bot - ignore
    return false
  }

  // Message mentions another bot (not ours) - ignore
  if (mentionsOtherBot(textContent, botInfo?.username)) {
    return false
  }

  try {
    const chatId = message.chat?.id
    const [chatMemory, globalMemory] = await Promise.all([
      chatId ? getChatMemory(chatId) : Promise.resolve(''),
      getGlobalMemory(),
    ])

    const hasMedia = !!imagesData?.length || !!message.photo?.length
    const memoryBlock =
      chatMemory || globalMemory
        ? `\nBot memory (use to better understand context):
${chatMemory ? `- Chat memory: ${chatMemory}` : ''}
${globalMemory ? `- Global memory: ${globalMemory}` : ''}`
        : ''

    const systemPrompt = `You are a quick filter for a Telegram group chat bot. Decide if the bot should engage with this message.

ENGAGE only if:
- Message explicitly mentions the bot by name/username ("бот", "ботик", @username, etc.)
- Message is a direct reply to the bot's previous message
- Message uses a bot command (starts with /) or clearly addresses the bot with a direct request
- Message has media with a caption explicitly mentioning the bot
- Message is relevant to something the bot remembers from memory AND the user addresses the bot

IGNORE (default) if:
- Normal conversation between users, even if it's a question
- Message mentions or replies to ANOTHER bot (not this one)
- Vague or generic requests not addressed to the bot
- Spam or gibberish
- Unsure - when in doubt, ignore

Context:
- From: ${message.from?.first_name || 'Unknown'}
- Is reply to bot: ${message.reply_to_message?.from?.is_bot || false}
- Has media: ${hasMedia}
- Message: "${textContent}"${memoryBlock}`

    const result = await getCheapModelWithTools().invoke([
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
