import {
  formatAiModelConfig,
  GEMINI_FLASH_LITE_IMAGE_MODEL,
} from './ai-model.utils'

describe('ai-model.utils', () => {
  test('formats provider-neutral model labels', () => {
    expect(
      formatAiModelConfig({ provider: 'openai', model: 'gpt-6-astra' }),
    ).toBe('openai/gpt-6-astra')
  })

  test('exports the Gemini image generation model', () => {
    expect(GEMINI_FLASH_LITE_IMAGE_MODEL).toEqual({
      provider: 'google',
      model: 'gemini-3.1-flash-lite-image',
    })
  })
})
