import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { ImageModel, LanguageModel, SpeechModel } from 'ai'

import type { AiModelConfig } from './ai-model.utils'

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

export function resetAiSdkProvidersForTests() {
  googleProvider = undefined
  googleProviderApiKey = ''
  openAiProvider = undefined
  openAiProviderApiKey = ''
}
