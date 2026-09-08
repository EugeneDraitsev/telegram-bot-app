import { formatAiModelConfig } from './ai-model.utils'

describe('ai-model.utils', () => {
  test('formats provider-neutral model labels', () => {
    expect(
      formatAiModelConfig({ provider: 'openai', model: 'gpt-6-astra' }),
    ).toBe('openai/gpt-6-astra')
  })
})
