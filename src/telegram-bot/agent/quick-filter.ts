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
  hasDirectRequestToBot,
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
      'The message requires a response from the bot. Use only for explicit direct requests to this bot.',
    schema: z.object({}),
    func: async () => ({ shouldEngage: true }),
  }),
  new DynamicStructuredTool({
    name: 'ignore',
    description:
      'Ignore the message. This is the default and preferred action unless direct request criteria are clearly met.',
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

  // Hard gate: message must be explicitly addressed to the bot with a clear request.
  const hasDirectRequest = hasDirectRequestToBot({
    text: textContent,
    isReplyToOurBot: replyingToOurBot,
    ourBotUsername: botInfo?.username,
  })
  if (!hasDirectRequest) {
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

    const systemPrompt = `You are a strict quick filter for a Telegram group bot.
Default decision is IGNORE.

ENGAGE only if ALL conditions are true:
- User directly addresses THIS bot (reply to this bot OR bot name/username is present)
- User clearly asks for an action or answer
- If another account is mentioned, THIS bot is also explicitly mentioned and requested

IGNORE in all other cases:
- Normal chat between users
- Mention of another bot/person without explicit mention of THIS bot
- Reply to this bot without explicit request
- Ambiguous, vague, or uncertain messages
- If unsure, ignore

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
