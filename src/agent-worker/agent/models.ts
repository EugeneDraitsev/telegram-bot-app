/**
 * Language models, reasoning effort, fallback and timeout for each agent role.
 * Reasoning effort reaches OpenAI and Anthropic; the Google provider drops it.
 * Media model selection belongs to services/image-generation.ts,
 * services/google-media.ts and services/google-tts.ts.
 */

import type { Chat } from 'grammy/types'

import {
  type AiModelConfig,
  type AiReasoningEffort,
  formatAiModelConfig,
  getAiSdkProviderOptions,
} from '@tg-bot/common'
import { getToolSafetyIdentifier } from '../tools/context'

/** A model together with the reasoning effort it is called with. */
export interface ModelChoice {
  config: AiModelConfig
  reasoningEffort: AiReasoningEffort
  /** `provider/model`, used for logs and metrics. */
  label: string
}

export interface ModelRole {
  primary: ModelChoice
  /** Tried once when the primary model fails or times out. */
  fallback: ModelChoice
  /** Budget for a single attempt. */
  timeoutMs: number
}

/** A role that drives the agent tool loop. */
export interface ChatRole extends ModelRole {
  /** Model rounds that may call tools before the final answer. */
  maxToolIterations: number
  /** No new tool round starts once the loop has run this long. */
  toolLoopBudgetMs: number
}

const choose = (
  config: AiModelConfig,
  reasoningEffort: AiReasoningEffort,
): ModelChoice => ({
  config,
  reasoningEffort,
  label: formatAiModelConfig(config),
})

const openai = (model: string, reasoningEffort: AiReasoningEffort) =>
  choose({ provider: 'openai', model }, reasoningEffort)

const google = (model: string) => choose({ provider: 'google', model }, 'none')

const anthropic = (model: string, reasoningEffort: AiReasoningEffort) =>
  choose({ provider: 'anthropic', model }, reasoningEffort)

/** Engage/ignore decision on every eligible message: the hot path. */
export const REPLY_GATE_ROLE: ModelRole = {
  primary: openai('gpt-6-luna', 'none'),
  fallback: google('gemini-3.5-flash-lite'),
  timeoutMs: 15_000,
}

/** Command cyber classification and short refusals; never uses the chat role. */
export const COMMAND_SAFETY_ROLE: ModelRole = {
  ...REPLY_GATE_ROLE,
  timeoutMs: 8_000,
}

/** Routing, tool loop and final synthesis. */
export const CHAT_ROLE: ChatRole = {
  primary: anthropic('claude-fable-5-2', 'medium'),
  fallback: openai('gpt-6-astra', 'low'),
  timeoutMs: 25_000,
  maxToolIterations: 4,
  toolLoopBudgetMs: 90_000,
}

/** Hosted code runtimes supported by the code_execution tool. */
export const CODE_EXECUTION_ROLE: ModelRole = {
  primary: CHAT_ROLE.fallback,
  fallback: google('gemini-3.8-flash'),
  timeoutMs: CHAT_ROLE.timeoutMs,
}

/** Web-backed search tools. */
export const WEB_SEARCH_ROLE: ModelRole = {
  primary: openai('gpt-6-luna', 'low'),
  fallback: openai('gpt-5.6-luna', 'low'),
  timeoutMs: 24_000,
}

/** Budget for a web search tool call: both attempts plus room between them. */
export const WEB_SEARCH_TOTAL_TIMEOUT_MS = WEB_SEARCH_ROLE.timeoutMs * 2 + 2_000

/**
 * `/o`: Claude Fable thinking at extra-high effort over more tool rounds.
 * Retries and fallbacks can outlast the loop budget, so the tool loop also
 * clamps every call to the Lambda's remaining time.
 */
export const DEEP_CHAT_ROLE: ChatRole = {
  primary: { ...CHAT_ROLE.primary, reasoningEffort: 'xhigh' },
  fallback: { ...CHAT_ROLE.fallback, reasoningEffort: 'medium' },
  timeoutMs: 90_000,
  maxToolIterations: 8,
  toolLoopBudgetMs: 150_000,
}

/**
 * Private chats can call send_widget, and a widget is a long answer: the
 * primary model needs more than the default budget to finish one. Groups keep
 * the short budget, so a stuck call still falls back quickly there.
 */
export const PRIVATE_CHAT_ROLE: ChatRole = { ...CHAT_ROLE, timeoutMs: 60_000 }

/** `/o` runs on the deep chat role; a private chat gets the widget budget. */
export function resolveAgentChatRole(
  commandName?: string,
  chatType?: Chat['type'],
): ChatRole {
  if (commandName === 'o') return DEEP_CHAT_ROLE
  return chatType === 'private' ? PRIVATE_CHAT_ROLE : CHAT_ROLE
}

export function getModelProviderOptions(
  choice: ModelChoice,
  options: {
    chatId?: string | number
    safetyIdentifier?: string
    truncation?: string
  } = {},
) {
  return getAiSdkProviderOptions(choice.config, {
    ...options,
    safetyIdentifier: options.safetyIdentifier ?? getToolSafetyIdentifier(),
    reasoningEffort: choice.reasoningEffort,
    store: false,
    serviceTier: choice.config.provider === 'google' ? 'priority' : undefined,
    // Telegram audio is a file part. Let OpenAI Responses forward media types
    // beyond the provider's conservative allowlist; Gemini accepts them natively.
    passThroughUnsupportedFiles: true,
  })
}
