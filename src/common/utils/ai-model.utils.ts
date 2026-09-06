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

/** Image model shared by the agent image tool and the currency background. */
export const GEMINI_FLASH_LITE_IMAGE_MODEL: AiModelConfig = {
  provider: 'google',
  model: 'gemini-3.1-flash-lite-image',
}

export function formatAiModelConfig(config: AiModelConfig): string {
  return `${config.provider}/${config.model}`
}
