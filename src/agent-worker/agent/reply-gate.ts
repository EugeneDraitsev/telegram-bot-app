import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import type { Message } from 'telegram-typings'

import {
  type BotIdentity,
  hasBotAddressSignal,
  isReplyToAnotherBot,
  isReplyToOurBot,
  mentionsAnotherAccount,
  mentionsOurBot,
} from '@tg-bot/common'
import { logger } from '../logger'
import { replyGateModel } from './models'

const REPLY_GATE_TIMEOUT_MS = 15_000

const replyGateTools = [
  new DynamicStructuredTool({
    name: 'engage',
    description:
      'The message is addressed to the bot and contains something meaningful.',
    schema: z.object({}),
    func: async () => ({ shouldEngage: true }),
  }),
  new DynamicStructuredTool({
    name: 'ignore',
    description:
      'Ignore the message. Use for clear noise: spam, meaningless characters, or messages clearly not meant for the bot.',
    schema: z.object({}),
    func: async () => ({ shouldEngage: false }),
  }),
]

let replyGateModelWithTools: ReturnType<
  typeof replyGateModel.bindTools
> | null = null

function getReplyGateModelWithTools() {
  if (!replyGateModelWithTools) {
    replyGateModelWithTools = replyGateModel.bindTools(replyGateTools)
  }
  return replyGateModelWithTools
}

export async function shouldEngageWithMessage(params: {
  message: Message
  textContent: string
  hasImages: boolean
  memoryBlock?: string
  botInfo?: BotIdentity
}): Promise<boolean> {
  const { message, textContent, hasImages, memoryBlock, botInfo } = params

  if (!textContent.trim() && !hasImages) {
    return false
  }

  const isReplyToOur = isReplyToOurBot(message, botInfo?.id)
  const isReplyToAnother = isReplyToAnotherBot(message, botInfo?.id)
  const hasOurMention = mentionsOurBot(textContent, botInfo?.username)

  if (isReplyToAnother && !hasOurMention) {
    return false
  }

  const addressedToBot =
    isReplyToOur || hasBotAddressSignal(textContent, botInfo?.username)

  if (!addressedToBot) {
    return false
  }

  try {
    const systemPrompt = `You are the FINAL reply gate for a Telegram group bot.

IMPORTANT: The message has ALREADY been verified as addressed to THIS bot (by name, username, or reply). Your job is to filter out clear noise and non-actionable statements.

You must call exactly one tool:
- engage: when the user explicitly asks a question, makes a request, gives a command, or expects a conversational reply
- ignore: for clear noise (spam, meaningless characters), OR for simple statements/compliments without a question (e.g., "молодец", "хороший бот", "красиво", "спасибо")

Rules:
- If user explicitly asks a question or makes a request to draw/tell/help — engage
- If user just praises or makes a short statement WITHOUT a question (e.g., "молодец", "спасибо") — ignore
- Greetings or "how are you" — engage
- If another account is mentioned but THIS bot is also mentioned — engage
- Pure spam, random characters, single emoji without context — ignore

Context:
- Is reply to OUR bot: ${isReplyToOur}
- Mentions OUR bot: ${hasOurMention}
- Mentions other account: ${mentionsAnotherAccount(textContent, botInfo?.username)}
- Has media: ${hasImages}
- Message: "${textContent || '[media without text]'}"
${memoryBlock ? `\n${memoryBlock}` : ''}`

    const result = await getReplyGateModelWithTools().invoke(
      [
        { role: 'system', content: systemPrompt },
        { role: 'human', content: textContent || '[media without text]' },
      ],
      { timeout: REPLY_GATE_TIMEOUT_MS },
    )

    const toolCalls = result.tool_calls ?? []
    if (toolCalls.length === 0) {
      return false
    }

    return toolCalls[0].name === 'engage'
  } catch (error) {
    logger.error({ error }, 'reply_gate.failed')
    return false
  }
}
