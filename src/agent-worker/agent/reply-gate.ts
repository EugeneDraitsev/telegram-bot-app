/**
 * Reply gate - deterministic pre-filter + structured engage/ignore decision.
 */

import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { Message } from 'telegram-typings'

import {
  type BotIdentity,
  getAiSdkLanguageModel,
  getMetricStatusFromError,
  hasBotAddressSignal,
  isReplyToAnotherBot,
  isReplyToOurBot,
  logger,
  mentionsAnotherAccount,
  mentionsOurBot,
  recordMetric,
} from '@tg-bot/common'
import { REPLY_GATE_TIMEOUT_MS } from './config'
import {
  REPLY_GATE_MODEL,
  REPLY_GATE_MODEL_CONFIG,
  REPLY_GATE_REASONING_EFFORT,
} from './models'

const replyGateOutput = Output.object({
  schema: z.object({
    decision: z.enum(['engage', 'ignore']),
  }),
})

function buildReplyGatePrompt(params: {
  isReplyToOur: boolean
  hasOurMention: boolean
  mentionsOther: boolean
  hasMedia: boolean
  textContent: string
  replyTargetText?: string
  memoryBlock?: string
}): string {
  return `You are the reply gate for a Telegram group bot.
Default decision: IGNORE.

Important:
- Upstream routing signals (mention/reply/bot words) are heuristic and can be wrong.
- Do NOT assume the user truly wants a bot reply just because the bot is mentioned or quoted.
- Engage only when it clearly makes sense that the user is talking TO THIS bot and expects a reply now.
- Treat reply-to-THIS-bot as weak context only. Engage only if the CURRENT message itself asks, requests, corrects, challenges, or clearly continues a task.
- Ignore short reactions, laughter, acknowledgements, and side comments even when they reply to THIS bot.

Return exactly one structured decision:
- engage: clear direct question/request/command to THIS bot in the current message
- ignore: everything else

ENGAGE only if at least one is true:
- User directly asks THIS bot a question.
- User gives THIS bot an explicit actionable request (help/explain/summarize/draw/generate/etc.).
- User asks THIS bot a follow-up or clarification about the replied-to message.
- User greets THIS bot in a way that expects a conversational response.
- Message with media clearly asks THIS bot something in caption/text.

IGNORE if any of these apply:
- Message talks ABOUT the bot in third person, not TO the bot.
- Meta statements about bot behavior/triggering.
- Short mention fragments without a clear ask.
- Reply/mention is aimed mainly at another person/account, even if THIS bot is present.
- Praise/thanks/laughter/reactions/acknowledgements without explicit question/request.
- Pure noise/spam/random chars/single emoji without context.
- Any uncertainty.

Mention nuance:
- Presence of THIS bot username alone is NOT enough.
- If THIS bot and another account are both mentioned, engage only with a clear direct ask to THIS bot; otherwise ignore.

Context:
- Is reply to OUR bot: ${params.isReplyToOur}
- Mentions OUR bot: ${params.hasOurMention}
- Mentions other account: ${params.mentionsOther}
- Has media: ${params.hasMedia}
- Message: "${params.textContent || '[media without text]'}"
- Replied-to message: "${params.replyTargetText || '[not a reply]'}"
${params.memoryBlock ? `\n${params.memoryBlock}` : ''}`
}

function buildReplyGateInput(message: Message, textContent: string): string {
  const replyTargetText =
    message.reply_to_message?.text || message.reply_to_message?.caption

  if (!replyTargetText) {
    return textContent || '[media without text]'
  }

  return [
    `Current message: ${textContent || '[media without text]'}`,
    `Replied-to message: ${replyTargetText}`,
  ].join('\n')
}

function getChatId(message: Message): number | undefined {
  const chatId = message.chat?.id
  return typeof chatId === 'number' ? chatId : undefined
}

function recordReplyGateMetric(params: {
  chatId?: number
  durationMs: number
  success: boolean
  error?: unknown
}) {
  if (params.chatId === undefined) return

  const status = params.success
    ? 'success'
    : getMetricStatusFromError(params.error)

  void recordMetric({
    type: 'model_call',
    source: 'agentic',
    name: 'reply_gate',
    model: REPLY_GATE_MODEL,
    chatId: params.chatId,
    durationMs: params.durationMs,
    success: params.success,
    status,
    timestamp: Date.now(),
  })
}

export async function shouldEngageWithMessage(params: {
  message: Message
  textContent: string
  hasMedia: boolean
  memoryBlock?: string
  botInfo?: BotIdentity
}): Promise<boolean> {
  const { message, textContent, hasMedia, memoryBlock, botInfo } = params
  const chatId = getChatId(message)

  if (!textContent.trim() && !hasMedia) {
    logger.info({ chatId, reason: 'empty_message' }, 'reply_gate.skip')
    return false
  }

  const isReplyToOur = isReplyToOurBot(message, botInfo?.id)
  const isReplyToAnother = isReplyToAnotherBot(message, botInfo?.id)
  const hasOurMention = mentionsOurBot(textContent, botInfo?.username)
  const mentionsOther = mentionsAnotherAccount(textContent, botInfo?.username)
  const hasBotAddress = hasBotAddressSignal(textContent, botInfo?.username)

  if (isReplyToAnother && !hasOurMention) {
    logger.info({ chatId, reason: 'reply_to_another_bot' }, 'reply_gate.skip')
    return false
  }

  const addressedToBot = isReplyToOur || hasBotAddress
  if (!addressedToBot) {
    logger.info({ chatId, reason: 'not_addressed_to_bot' }, 'reply_gate.skip')
    return false
  }

  if (isReplyToOur && mentionsOther && !hasBotAddress) {
    logger.info(
      { chatId, reason: 'reply_to_our_bot_but_addressed_to_other' },
      'reply_gate.skip',
    )
    return false
  }

  const startedAt = Date.now()

  try {
    const instructions = buildReplyGatePrompt({
      isReplyToOur,
      hasOurMention,
      mentionsOther,
      hasMedia,
      textContent,
      replyTargetText:
        message.reply_to_message?.text || message.reply_to_message?.caption,
      memoryBlock,
    })

    logger.info(
      {
        chatId,
        model: REPLY_GATE_MODEL,
        reasoningEffort: REPLY_GATE_REASONING_EFFORT,
        timeoutMs: REPLY_GATE_TIMEOUT_MS,
      },
      'reply_gate.model_call',
    )

    const response = await generateText({
      model: getAiSdkLanguageModel(REPLY_GATE_MODEL_CONFIG),
      system: instructions,
      prompt: buildReplyGateInput(message, textContent),
      output: replyGateOutput,
      temperature: 0,
      maxRetries: 0,
      timeout: REPLY_GATE_TIMEOUT_MS,
      providerOptions:
        REPLY_GATE_MODEL_CONFIG.provider === 'google'
          ? {
              google: {
                serviceTier: 'priority',
              },
            }
          : {
              openai: {
                reasoningEffort: REPLY_GATE_REASONING_EFFORT,
                serviceTier: 'priority',
                store: false,
              },
            },
    })

    const decision = response.output.decision
    const durationMs = Date.now() - startedAt

    logger.info(
      {
        chatId,
        model: REPLY_GATE_MODEL,
        decision,
        durationMs,
      },
      'reply_gate.done',
    )
    recordReplyGateMetric({ chatId, durationMs, success: true })

    return decision === 'engage'
  } catch (error) {
    const durationMs = Date.now() - startedAt
    logger.error(
      { chatId, model: REPLY_GATE_MODEL, durationMs, error },
      'reply_gate.failed',
    )
    recordReplyGateMetric({ chatId, durationMs, success: false, error })
    return false
  }
}
