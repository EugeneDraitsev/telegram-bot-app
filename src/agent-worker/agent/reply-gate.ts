/**
 * Reply gate - structured engage/ignore decision for every eligible message.
 */

import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { Message } from 'grammy/types'

import {
  type BotIdentity,
  getAiSdkLanguageModel,
  getMessageText,
  getMetricStatusFromError,
  isReplyToAnotherBot,
  isReplyToOurBot,
  logger,
  mentionsAnotherAccount,
  mentionsOurBot,
  recordMetric,
} from '@tg-bot/common'
import {
  getModelProviderOptions,
  type ModelChoice,
  REPLY_GATE_ROLE,
} from './models'
import { withTimeout } from './utils'

const replyGateOutput = Output.object({
  schema: z.object({
    decision: z.enum(['engage', 'ignore']),
  }),
})

class ReplyGateTimeoutError extends Error {
  constructor(
    readonly model: string,
    readonly timeoutMs: number,
  ) {
    super(`Reply gate model ${model} timed out after ${timeoutMs}ms`)
    this.name = 'ReplyGateTimeoutError'
  }
}

function buildReplyGatePrompt(params: {
  isReplyToOur: boolean
  isReplyToAnother: boolean
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

Recipient ambiguity in group chats:
- Second-person words such as "ты", "тебе", "тебя", or "you" do NOT mean the message is addressed to THIS bot.
- Without a reply to THIS bot, an @mention of THIS bot, or an explicit vocative such as "бот" or "ботик", assume ambiguous conversational statements are addressed to another human.
- Statements of desire, intention, or an offer are NOT requests to THIS bot.
- Do not engage merely because THIS bot could perform the mentioned action.
- A standalone informational question without an address may still engage only when it is clearly a general question with no plausible human recipient.
- If uncertain who the recipient is, IGNORE.

Examples:
- "Придумала тебе развлечение" -> IGNORE
- "хочу ландшафтный дизайн нагенерить" -> IGNORE
- "бот, придумай мне развлечение" -> ENGAGE
- "бот, нагенерь ландшафтный дизайн" -> ENGAGE

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
- A natural-language vocative such as "бот, ...", "ботик, ...", or "bot, ..." is strong evidence that the user is talking TO THIS bot, even without an @username. Engage when the rest of that message contains a request, question, follow-up, or conversational ping.
- Still use the full sentence to distinguish direct address from third-person discussion about a bot. Do not rely on a keyword alone.
- If THIS bot and another account are both mentioned, engage only with a clear direct ask to THIS bot; otherwise ignore.

Context:
- Is reply to OUR bot: ${params.isReplyToOur}
- Is reply to ANOTHER bot: ${params.isReplyToAnother}
- Mentions OUR bot: ${params.hasOurMention}
- Mentions other account: ${params.mentionsOther}
- Has media: ${params.hasMedia}
- Message: "${params.textContent || '[media without text]'}"
- Replied-to message: "${params.replyTargetText || '[not a reply]'}"
${params.memoryBlock ? `\n${params.memoryBlock}` : ''}`
}

function buildReplyGateInput(message: Message, textContent: string): string {
  const replyTargetText = getMessageText(message.reply_to_message)

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

async function recordReplyGateMetric(params: {
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

  await recordMetric({
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
  choice: ModelChoice
  instructions: string
  prompt: string
  fallbackFrom?: string
}): Promise<boolean> {
  const startedAt = Date.now()
  const { choice } = params
  const { timeoutMs } = REPLY_GATE_ROLE

  logger.info(
    {
      chatId: params.chatId,
      attempt: params.attempt,
      model: choice.label,
      reasoningEffort: choice.reasoningEffort,
      timeoutMs,
      fallbackFrom: params.fallbackFrom,
    },
    'reply_gate.model_call',
  )

  try {
    const response = await withTimeout(
      generateText({
        model: getAiSdkLanguageModel(choice.config),
        system: params.instructions,
        prompt: params.prompt,
        output: replyGateOutput,
        ...(choice.config.provider === 'openai' ? {} : { temperature: 0 }),
        maxRetries: 0,
        timeout: timeoutMs + 1_000,
        providerOptions: getModelProviderOptions(choice),
      }),
      timeoutMs,
      new ReplyGateTimeoutError(choice.label, timeoutMs),
    )

    const decision = response.output.decision
    const durationMs = Date.now() - startedAt

    logger.info(
      {
        chatId: params.chatId,
        attempt: params.attempt,
        model: choice.label,
        decision,
        durationMs,
        fallbackFrom: params.fallbackFrom,
      },
      'reply_gate.done',
    )
    await recordReplyGateMetric({
      chatId: params.chatId,
      durationMs,
      model: choice.label,
      fallbackFrom: params.fallbackFrom,
      success: true,
    })

    return decision === 'engage'
  } catch (error) {
    const durationMs = Date.now() - startedAt
    logger.error(
      {
        chatId: params.chatId,
        attempt: params.attempt,
        model: choice.label,
        fallbackFrom: params.fallbackFrom,
        durationMs,
        error,
      },
      params.attempt === 'fallback'
        ? 'reply_gate.fallback_failed'
        : 'reply_gate.failed',
    )
    await recordReplyGateMetric({
      chatId: params.chatId,
      durationMs,
      model: choice.label,
      fallbackFrom: params.fallbackFrom,
      success: false,
      error,
    })
    throw error
  }
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

  const instructions = buildReplyGatePrompt({
    isReplyToOur,
    isReplyToAnother,
    hasOurMention,
    mentionsOther,
    hasMedia,
    textContent,
    replyTargetText: getMessageText(message.reply_to_message),
    memoryBlock,
  })
  const prompt = buildReplyGateInput(message, textContent)

  try {
    return await callReplyGateModel({
      chatId,
      attempt: 'primary',
      choice: REPLY_GATE_ROLE.primary,
      instructions,
      prompt,
    })
  } catch {}

  logger.warn(
    {
      chatId,
      model: REPLY_GATE_ROLE.fallback.label,
      fallbackFrom: REPLY_GATE_ROLE.primary.label,
    },
    'reply_gate.fallback_invoked',
  )

  try {
    return await callReplyGateModel({
      chatId,
      attempt: 'fallback',
      choice: REPLY_GATE_ROLE.fallback,
      instructions,
      prompt,
      fallbackFrom: REPLY_GATE_ROLE.primary.label,
    })
  } catch {
    return false
  }
}
