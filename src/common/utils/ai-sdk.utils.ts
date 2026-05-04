import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'

import type { AiModelConfig } from './ai-model.utils'

let googleProvider: ReturnType<typeof createGoogleGenerativeAI> | undefined
let googleProviderApiKey = ''
let openAiProvider: ReturnType<typeof createOpenAI> | undefined
let openAiProviderApiKey = ''

function getGoogleApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
}

function getGoogleProvider() {
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

function getOpenAiProvider() {
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
    return getGoogleProvider().chat(config.model)
  }

  return getOpenAiProvider().responses(config.model)
}

export function getAiSdkGoogleTools() {
  return getGoogleProvider().tools
}

export function resetAiSdkProvidersForTests() {
  googleProvider = undefined
  googleProviderApiKey = ''
  openAiProvider = undefined
  openAiProviderApiKey = ''
}
