export type AiProvider = 'google' | 'openai'

export type AiReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'

export interface AiModelConfig {
  provider: AiProvider
  model: string
}

export const DEFAULT_FAST_TEXT_MODEL: AiModelConfig = {
  provider: 'google',
  model: 'gemini-3.1-flash-lite-preview',
}

export const DEFAULT_HELPER_TEXT_MODEL: AiModelConfig = {
  provider: 'google',
  model: 'gemini-2.5-flash-lite',
}

export const DEFAULT_OPENAI_TEXT_MODEL: AiModelConfig = {
  provider: 'openai',
  model: 'gpt-5.5',
}

export const DEFAULT_WEB_SEARCH_MODEL: AiModelConfig = {
  provider: 'openai',
  model: 'gpt-5.4-nano',
}

export const DEFAULT_IMAGE_GENERATION_MODEL: AiModelConfig = {
  provider: 'google',
  model: 'gemini-3.1-flash-image-preview',
}

export const DEFAULT_EDITABLE_IMAGE_MODEL: AiModelConfig = {
  provider: 'openai',
  model: 'gpt-image-2',
}

const PROVIDER_PREFIX_REGEX = /^(google|openai)[:/](.+)$/i

function isAiProvider(value: string): value is AiProvider {
  return value === 'google' || value === 'openai'
}

function inferProvider(model: string, fallback: AiModelConfig): AiProvider {
  if (
    model.startsWith('gemini-') ||
    model.startsWith('gemma-') ||
    model.startsWith('imagen-')
  ) {
    return 'google'
  }

  if (
    model.startsWith('gpt-') ||
    model.startsWith('o1') ||
    model.startsWith('o3') ||
    model.startsWith('o4') ||
    model.startsWith('dall-e-')
  ) {
    return 'openai'
  }

  return fallback.provider
}

export function parseAiModelConfig(
  value: string | undefined,
  fallback: AiModelConfig,
): AiModelConfig {
  const raw = value?.trim()
  if (!raw) {
    return fallback
  }

  const prefixed = raw.match(PROVIDER_PREFIX_REGEX)
  if (prefixed?.[1] && prefixed[2]?.trim()) {
    const provider = prefixed[1].toLowerCase()
    if (isAiProvider(provider)) {
      return { provider, model: prefixed[2].trim() }
    }
  }

  return {
    provider: inferProvider(raw, fallback),
    model: raw,
  }
}

export function getAiModelConfig(
  envName: string,
  fallback: AiModelConfig,
): AiModelConfig {
  return parseAiModelConfig(process.env[envName], fallback)
}

export function formatAiModelConfig(config: AiModelConfig): string {
  return `${config.provider}/${config.model}`
}
