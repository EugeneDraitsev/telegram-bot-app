import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { ImageModel, JSONValue, LanguageModel, SpeechModel } from 'ai'

import type { AiModelConfig, AiReasoningEffort } from './ai-model.utils'

let googleProvider: ReturnType<typeof createGoogleGenerativeAI> | undefined
let googleProviderApiKey = ''
let openAiProvider: ReturnType<typeof createOpenAI> | undefined
let openAiProviderApiKey = ''

function getGoogleApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
}

export function getAiSdkGoogleProvider() {
  const apiKey = getGoogleApiKey()
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set')
  }

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

export function getAiSdkLanguageModel(config: AiModelConfig): LanguageModel {
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

export function getAiSdkOpenAiSpeechModel(model: string): SpeechModel {
  return getAiSdkOpenAiProvider().speech(model)
}

export function getAiSdkProviderOptions(
  config: AiModelConfig,
  options: {
    reasoningEffort?: AiReasoningEffort
    chatId?: string | number
    safetyIdentifier?: string
    serviceTier?: string
    store?: boolean
    truncation?: string
  } = {},
): Record<string, Record<string, JSONValue>> {
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

  return { openai: openaiOptions }
}

export function resetAiSdkProvidersForTests() {
  googleProvider = undefined
  googleProviderApiKey = ''
  openAiProvider = undefined
  openAiProviderApiKey = ''
}
