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

export function formatAiModelConfig(config: AiModelConfig): string {
  return `${config.provider}/${config.model}`
}
