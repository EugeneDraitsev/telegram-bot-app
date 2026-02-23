/**
 * Reply gate — LLM-based filter using gemini-2.5-flash-lite.
 * Deterministic pre-filter + LLM engage/ignore decision.
 */

import { Type } from '@google/genai'
import type { FunctionDeclaration } from '@google/genai'
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
import { REPLY_GATE_TIMEOUT_MS } from './config'
import { ai, REPLY_GATE_MODEL } from './models'

const replyGateTools: FunctionDeclaration[] = [
  {
    name: 'engage',
    description:
      'The message is addressed to the bot and contains something meaningful.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'ignore',
    description:
      'Ignore the message. Use for clear noise: spam, meaningless characters, or messages clearly not meant for the bot.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
]

function buildReplyGatePrompt(params: {
  isReplyToOur: boolean
  hasOurMention: boolean
  mentionsOther: boolean
  hasImages: boolean
  textContent: string
  memoryBlock?: string
}): string {
  return `You are the reply gate for a Telegram group bot.
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
- Is reply to OUR bot: ${params.isReplyToOur}
- Mentions OUR bot: ${params.hasOurMention}
- Mentions other account: ${params.mentionsOther}
- Has media: ${params.hasImages}
- Message: "${params.textContent || '[media without text]'}"
${params.memoryBlock ? `\n${params.memoryBlock}` : ''}`
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
    const systemPrompt = buildReplyGatePrompt({
      isReplyToOur,
      hasOurMention,
      mentionsOther: mentionsAnotherAccount(textContent, botInfo?.username),
      hasImages,
      textContent,
      memoryBlock,
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REPLY_GATE_TIMEOUT_MS)

    try {
      const response = await ai.models.generateContent({
        model: REPLY_GATE_MODEL,
        contents: [
          {
            role: 'user',
            parts: [{ text: textContent || '[media without text]' }],
          },
        ],
        config: {
          systemInstruction: systemPrompt,
          tools: [{ functionDeclarations: replyGateTools }],
          temperature: 0,
        },
      })

      const parts = response.candidates?.[0]?.content?.parts ?? []
      const functionCall = parts.find((p) => p.functionCall)?.functionCall

      if (!functionCall) {
        return false
      }

      return functionCall.name === 'engage'
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    logger.error({ error }, 'reply_gate.failed')
    return false
  }
}
