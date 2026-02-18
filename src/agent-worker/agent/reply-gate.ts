import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import type { Message } from 'telegram-typings'

import {
  type BotIdentity,
  hasBotAddressSignal,
  hasExplicitRequestSignal,
  isReplyToAnotherBot,
  isReplyToOurBot,
  mentionsAnotherAccount,
  mentionsOurBot,
} from '@tg-bot/common'
import { logger } from '../logger'
import { chatModel } from './models'

const REPLY_GATE_TIMEOUT_MS = 15_000

const replyGateTools = [
  new DynamicStructuredTool({
    name: 'engage',
    description:
      'Allow bot response only when the user explicitly and directly asks THIS bot.',
    schema: z.object({}),
    func: async () => ({ shouldEngage: true }),
  }),
  new DynamicStructuredTool({
    name: 'ignore',
    description:
      'Ignore by default. Use unless explicit direct request criteria are clearly satisfied.',
    schema: z.object({}),
    func: async () => ({ shouldEngage: false }),
  }),
]

let replyGateModelWithTools: ReturnType<typeof chatModel.bindTools> | null =
  null

function getReplyGateModelWithTools() {
  if (!replyGateModelWithTools) {
    replyGateModelWithTools = chatModel.bindTools(replyGateTools)
  }
  return replyGateModelWithTools
}

export async function shouldRespondAfterRecheck(params: {
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

  if (isReplyToAnotherBot(message, botInfo?.id)) {
    return false
  }

  const hasOurMention = mentionsOurBot(textContent, botInfo?.username)
  const hasAnotherMention = mentionsAnotherAccount(
    textContent,
    botInfo?.username,
  )

  if (hasAnotherMention && !hasOurMention) {
    return false
  }

  const replyingToOurBot = isReplyToOurBot(message, botInfo?.id)
  const addressedToBot =
    replyingToOurBot || hasBotAddressSignal(textContent, botInfo?.username)
  if (!addressedToBot) {
    return false
  }

  try {
    const systemPrompt = `You are the FINAL reply gate for a Telegram group bot.
Default decision is IGNORE.

You must call exactly one tool:
- engage: only if this is an explicit direct request to THIS bot
- ignore: in every other case

Strict rules:
- Mention of another account is allowed only when THIS bot is also explicitly mentioned
- Reply to this bot without explicit request => ignore
- Casual chat, commentary, reactions, emojis, acknowledgements => ignore
- If uncertain, choose ignore

Context:
- Is reply to OUR bot: ${replyingToOurBot}
- Mentions OUR bot: ${hasOurMention}
- Mentions other account: ${hasAnotherMention}
- Has explicit request signal: ${hasExplicitRequestSignal(textContent)}
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
