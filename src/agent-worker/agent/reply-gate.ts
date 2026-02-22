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
    const systemPrompt = `You are the reply gate for a Telegram group bot.
Default decision: IGNORE.

Important:
- Upstream routing signals (mention/reply/bot words) are heuristic and can be wrong.
- Do NOT assume the user truly wants a bot reply just because the bot is mentioned or quoted.
- Engage only when it clearly makes sense that the user is talking TO THIS bot and expects a reply now.

You must call exactly one tool:
- engage: clear direct question/request/command to THIS bot in the current message
- ignore: everything else

ENGAGE only if at least one is true:
- User directly asks THIS bot a question.
- User gives THIS bot an explicit actionable request (help/explain/summarize/draw/generate/etc.).
- User greets THIS bot in a way that expects a conversational response ("ботик ты как?", "привет бот").
- Message with media clearly asks THIS bot something in caption/text.

IGNORE if any of these apply:
- Message talks ABOUT the bot in third person, not TO the bot.
- Meta statements about bot behavior/triggering: "нас бот тригернулся", "бот триггернулся", "бот опять ответил".
- Short mention fragments without a clear ask: "@username журнал макмилена", "@botname <noun phrase>".
- Reply/mention is aimed mainly at another person/account, even if THIS bot is present.
- Praise/thanks/reactions without explicit question/request ("молодец", "спасибо", "красиво").
- Pure noise/spam/random chars/single emoji without context.
- Any uncertainty.

Mention nuance:
- Presence of THIS bot username alone is NOT enough.
- If THIS bot and another account are both mentioned, engage only with a clear direct ask to THIS bot; otherwise ignore.

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
