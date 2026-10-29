import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { ImageModel, JSONValue, LanguageModel } from 'ai'

import type { AiModelConfig, AiReasoningEffort } from './ai-model.utils'

let anthropicProvider: ReturnType<typeof createAnthropic> | undefined
let anthropicProviderApiKey = ''
let googleProvider: ReturnType<typeof createGoogleGenerativeAI> | undefined
let googleProviderApiKey = ''
let openAiProvider: ReturnType<typeof createOpenAI> | undefined
let openAiProviderApiKey = ''

export function getGoogleApiKey(): string {
  const apiKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY is not set')
  }

  return apiKey
}

export function getAiSdkGoogleProvider() {
  const apiKey = getGoogleApiKey()

  if (!googleProvider || googleProviderApiKey !== apiKey) {
    googleProvider = createGoogleGenerativeAI({ apiKey })
    googleProviderApiKey = apiKey
  }

  return googleProvider
}

export function getAiSdkOpenAiProvider() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set')
  }

  if (!openAiProvider || openAiProviderApiKey !== apiKey) {
    openAiProvider = createOpenAI({ apiKey })
    openAiProviderApiKey = apiKey
  }

  return openAiProvider
}

export function getAiSdkAnthropicProvider() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }

  if (!anthropicProvider || anthropicProviderApiKey !== apiKey) {
    anthropicProvider = createAnthropic({ apiKey })
    anthropicProviderApiKey = apiKey
  }

  return anthropicProvider
}

export function getAiSdkLanguageModel(config: AiModelConfig): LanguageModel {
  if (config.provider === 'anthropic') {
    return getAiSdkAnthropicProvider().messages(config.model)
  }

  if (config.provider === 'google') {
    return getAiSdkGoogleProvider().chat(config.model)
  }

  return getAiSdkOpenAiProvider().responses(config.model)
}

export function getAiSdkGoogleTools() {
  return getAiSdkGoogleProvider().tools
}

export function getAiSdkOpenAiTools() {
  return getAiSdkOpenAiProvider().tools
}

export function getAiSdkOpenAiImageModel(model: string): ImageModel {
  return getAiSdkOpenAiProvider().image(model)
}

const ANTHROPIC_EFFORTS = new Set<AiReasoningEffort>([
  'low',
  'medium',
  'high',
  'xhigh',
])

export function getAiSdkProviderOptions(
  config: AiModelConfig,
  options: {
    reasoningEffort?: AiReasoningEffort
    chatId?: string | number
    safetyIdentifier?: string
    serviceTier?: string
    store?: boolean
    truncation?: string
    passThroughUnsupportedFiles?: boolean
  } = {},
): Record<string, Record<string, JSONValue>> {
  if (config.provider === 'anthropic') {
    const anthropicOptions: Record<string, JSONValue> = {
      // Cache the prompt prefix so tool-loop iterations reread it cheaply.
      cacheControl: { type: 'ephemeral' },
      // A safety refusal reruns on Anthropic's recommended fallback model.
      fallbacks: 'default',
    }
    if (
      options.reasoningEffort &&
      ANTHROPIC_EFFORTS.has(options.reasoningEffort)
    ) {
      anthropicOptions.effort = options.reasoningEffort
    }
    const userId =
      options.safetyIdentifier ??
      (options.chatId === undefined ? undefined : String(options.chatId))
    if (userId) {
      anthropicOptions.metadata = { userId }
    }
    return { anthropic: anthropicOptions }
  }

  if (config.provider === 'google') {
    return {
      google: options.serviceTier ? { serviceTier: options.serviceTier } : {},
    }
  }

  const openaiOptions: Record<string, JSONValue> = {}
  if (options.reasoningEffort) {
    openaiOptions.reasoningEffort = options.reasoningEffort
  }
  if (options.safetyIdentifier) {
    openaiOptions.safetyIdentifier = options.safetyIdentifier
  } else if (options.chatId !== undefined) {
    openaiOptions.safetyIdentifier = String(options.chatId)
  }
  if (options.serviceTier) {
    openaiOptions.serviceTier = options.serviceTier
  }
  if (options.store !== undefined) {
    openaiOptions.store = options.store
  }
  if (options.truncation) {
    openaiOptions.truncation = options.truncation
  }
  if (options.passThroughUnsupportedFiles !== undefined) {
    openaiOptions.passThroughUnsupportedFiles =
      options.passThroughUnsupportedFiles
  }

  return { openai: openaiOptions }
}

export function resetAiSdkProvidersForTests() {
  anthropicProvider = undefined
  anthropicProviderApiKey = ''
  googleProvider = undefined
  googleProviderApiKey = ''
  openAiProvider = undefined
  openAiProviderApiKey = ''
}
