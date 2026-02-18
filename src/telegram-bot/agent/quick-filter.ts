/**
 * Step 1: Quick Filter (Cheap Model)
 * Quickly decides if the bot should engage with the message.
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { z } from 'zod'
import type { Message } from 'telegram-typings'

import {
  getChatMemory,
  getGlobalMemory,
  hasBotAddressSignal,
  hasExplicitRequestSignal,
  isReplyToAnotherBot,
  isReplyToOurBot,
  mentionsAnotherAccount,
  mentionsOurBot,
} from '@tg-bot/common'

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
      'The message is addressed to the bot and contains something meaningful. This is the default for addressed messages.',
    schema: z.object({}),
    func: async () => ({ shouldEngage: true }),
  }),
  new DynamicStructuredTool({
    name: 'ignore',
    description:
      'Ignore the message. Use only for clear noise: spam, meaningless characters, or messages clearly not meant for the bot.',
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
 * Quick filter using cheap model to decide ENGAGE or IGNORE
 */
export async function quickFilter(
  message: Message,
  imagesData?: Buffer[],
  botInfo?: BotInfo,
): Promise<boolean> {
  const textContent = message.text || message.caption || ''
  const normalizedText = textContent.trimStart()

  // Slash commands are always an explicit bot request.
  if (normalizedText.startsWith('/')) {
    return true
  }

  // Skip very short messages without images.
  if (textContent.length < 3 && !imagesData?.length) {
    return false
  }

  const replyingToOurBot = isReplyToOurBot(message, botInfo?.id)
  if (isReplyToAnotherBot(message, botInfo?.id)) {
    return false
  }

  const hasOurMention = mentionsOurBot(textContent, botInfo?.username)
  const hasAnotherMention = mentionsAnotherAccount(
    textContent,
    botInfo?.username,
  )

  // Mentioning another account is allowed only if our bot is also explicitly mentioned.
  if (hasAnotherMention && !hasOurMention) {
    return false
  }

  // If the message is addressed to the bot (mention, bot word, or reply), let the LLM decide.
  const addressedToBot =
    replyingToOurBot || hasBotAddressSignal(textContent, botInfo?.username)
  if (!addressedToBot) {
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
        ? `\nBot memory (for context only):\n${chatMemory ? `- Chat memory: ${chatMemory}` : ''}\n${globalMemory ? `- Global memory: ${globalMemory}` : ''}`
        : ''

    const systemPrompt = `You are a quick filter for a Telegram group bot.

ENGAGE only if:
- Message mentions the bot ("бот", "ботик", "ботяра", "bot", "ботан", etc) and IT MAKES SENSE that the user is talking to the bot (not just mentioning it in third person)
- Message is a reply to the bot's previous message and IT MAKES SENSE that the user is asking the bot about clarification or asking something to do (draw, tell, help, explain, etc.). Don't reply on "great job" or something like that.
- User is clearly asking the bot something
- Message has media (photo/image) with caption mentioning the bot

IGNORE (default) if:
- The message is clearly NOT meant for the bot to answer
- Pure spam or meaningless characters
- Unsure - when in doubt, ignore

Context:
- From: ${message.from?.first_name || 'Unknown'}
- Is reply to OUR bot: ${replyingToOurBot}
- Mentions OUR bot: ${hasOurMention}
- Mentions other account: ${hasAnotherMention}
- Has explicit request signal: ${hasExplicitRequestSignal(textContent)}
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
