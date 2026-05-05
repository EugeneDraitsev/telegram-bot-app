/**
 * Reply gate - deterministic pre-filter + structured engage/ignore decision.
 */

import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { Message } from 'telegram-typings'

import {
  type AiModelConfig,
  type AiReasoningEffort,
  type BotIdentity,
  getAiSdkLanguageModel,
  getAiSdkProviderOptions,
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
  REPLY_GATE_FALLBACK_MODEL,
  REPLY_GATE_FALLBACK_MODEL_CONFIG,
  REPLY_GATE_FALLBACK_REASONING_EFFORT,
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
  model: string
  success: boolean
  error?: unknown
  fallbackFrom?: string
}) {
  if (params.chatId === undefined) return

  const status = params.success
    ? 'success'
    : getMetricStatusFromError(params.error)

  void recordMetric({
    type: 'model_call',
    source: 'agentic',
    name: 'reply_gate',
    model: params.model,
    fallbackFrom: params.fallbackFrom,
    chatId: params.chatId,
    durationMs: params.durationMs,
    success: params.success,
    status,
    timestamp: Date.now(),
  })
}

async function callReplyGateModel(params: {
  chatId?: number
  attempt: 'primary' | 'fallback'
  model: string
  modelConfig: AiModelConfig
  reasoningEffort: AiReasoningEffort
  instructions: string
  prompt: string
  fallbackFrom?: string
}): Promise<boolean> {
  const startedAt = Date.now()

  logger.info(
    {
      chatId: params.chatId,
      attempt: params.attempt,
      model: params.model,
      reasoningEffort: params.reasoningEffort,
      timeoutMs: REPLY_GATE_TIMEOUT_MS,
      fallbackFrom: params.fallbackFrom,
    },
    'reply_gate.model_call',
  )

  const response = await generateText({
    model: getAiSdkLanguageModel(params.modelConfig),
    system: params.instructions,
    prompt: params.prompt,
    output: replyGateOutput,
    temperature: 0,
    maxRetries: 0,
    timeout: REPLY_GATE_TIMEOUT_MS,
    providerOptions: getAiSdkProviderOptions(params.modelConfig, {
      reasoningEffort: params.reasoningEffort,
      serviceTier: 'priority',
      store: false,
    }),
  })

  const decision = response.output.decision
  const durationMs = Date.now() - startedAt

  logger.info(
    {
      chatId: params.chatId,
      attempt: params.attempt,
      model: params.model,
      decision,
      durationMs,
      fallbackFrom: params.fallbackFrom,
    },
    'reply_gate.done',
  )
  recordReplyGateMetric({
    chatId: params.chatId,
    durationMs,
    model: params.model,
    fallbackFrom: params.fallbackFrom,
    success: true,
  })

  return decision === 'engage'
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
  const prompt = buildReplyGateInput(message, textContent)

  try {
    return await callReplyGateModel({
      chatId,
      attempt: 'primary',
      model: REPLY_GATE_MODEL,
      modelConfig: REPLY_GATE_MODEL_CONFIG,
      reasoningEffort: REPLY_GATE_REASONING_EFFORT,
      instructions,
      prompt,
    })
  } catch (error) {
    const durationMs = Date.now() - startedAt
    logger.error(
      { chatId, model: REPLY_GATE_MODEL, durationMs, error },
      'reply_gate.failed',
    )
    recordReplyGateMetric({
      chatId,
      durationMs,
      model: REPLY_GATE_MODEL,
      success: false,
      error,
    })
  }

  logger.warn(
    {
      chatId,
      model: REPLY_GATE_FALLBACK_MODEL,
      fallbackFrom: REPLY_GATE_MODEL,
    },
    'reply_gate.fallback_invoked',
  )

  try {
    return await callReplyGateModel({
      chatId,
      attempt: 'fallback',
      model: REPLY_GATE_FALLBACK_MODEL,
      modelConfig: REPLY_GATE_FALLBACK_MODEL_CONFIG,
      reasoningEffort: REPLY_GATE_FALLBACK_REASONING_EFFORT,
      instructions,
      prompt,
      fallbackFrom: REPLY_GATE_MODEL,
    })
  } catch (error) {
    const durationMs = Date.now() - startedAt
    logger.error(
      {
        chatId,
        model: REPLY_GATE_FALLBACK_MODEL,
        fallbackFrom: REPLY_GATE_MODEL,
        durationMs,
        error,
      },
      'reply_gate.fallback_failed',
    )
    recordReplyGateMetric({
      chatId,
      durationMs,
      model: REPLY_GATE_FALLBACK_MODEL,
      fallbackFrom: REPLY_GATE_MODEL,
      success: false,
      error,
    })
    return false
  }
}
