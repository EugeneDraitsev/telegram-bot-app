/**
 * Language models, reasoning effort, fallback and timeout for each agent role.
 * Reasoning effort reaches OpenAI and Anthropic; the Google provider drops it.
 * Media model selection belongs to services/image-generation.ts,
 * services/google-media.ts and services/google-tts.ts.
 */

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

/** Routing, tool loop, final synthesis and the code_execution tool. */
export const CHAT_ROLE: ChatRole = {
  primary: openai('gpt-6-astra', 'low'),
  fallback: google('gemini-3.8-flash'),
  timeoutMs: 25_000,
  maxToolIterations: 4,
  toolLoopBudgetMs: 90_000,
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
 * `/o`: Claude Opus thinking at extra-high effort over more tool rounds.
 * Retries and fallbacks can outlast the loop budget, so the tool loop also
 * clamps every call to the Lambda's remaining time.
 */
export const DEEP_CHAT_ROLE: ChatRole = {
  primary: anthropic('claude-opus-5-5', 'xhigh'),
  fallback: { ...CHAT_ROLE.primary, reasoningEffort: 'medium' },
  timeoutMs: 90_000,
  maxToolIterations: 8,
  toolLoopBudgetMs: 150_000,
}

/** `/o` runs on the deep chat role; every other command uses the default. */
export function resolveAgentChatRole(commandName?: string): ChatRole {
  return commandName === 'o' ? DEEP_CHAT_ROLE : CHAT_ROLE
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
