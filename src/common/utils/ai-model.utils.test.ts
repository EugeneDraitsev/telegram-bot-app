import {
  DEFAULT_FAST_TEXT_MODEL,
  formatAiModelConfig,
  GEMINI_FLASH_IMAGE_MODEL,
  GEMINI_PRO_IMAGE_MODEL,
  parseAiModelConfig,
} from './ai-model.utils'

describe('ai-model.utils', () => {
  test('parses explicit provider/model values', () => {
    expect(
      parseAiModelConfig('openai:gpt-5.4-nano', DEFAULT_FAST_TEXT_MODEL),
    ).toEqual({
      provider: 'openai',
      model: 'gpt-5.4-nano',
    })

    expect(
      parseAiModelConfig(
        'google/gemini-3.1-flash-lite',
        DEFAULT_FAST_TEXT_MODEL,
      ),
    ).toEqual({
      provider: 'google',
      model: 'gemini-3.1-flash-lite',
    })
  })

  test('infers provider for bare model names', () => {
    expect(parseAiModelConfig('gpt-5.5', DEFAULT_FAST_TEXT_MODEL)).toEqual({
      provider: 'openai',
      model: 'gpt-5.5',
    })

    expect(
      parseAiModelConfig('gemini-3.1-flash-lite', {
        provider: 'openai',
        model: 'fallback',
      }),
    ).toEqual({
      provider: 'google',
      model: 'gemini-3.1-flash-lite',
    })
  })

  test('formats provider-neutral model labels', () => {
    expect(formatAiModelConfig(DEFAULT_FAST_TEXT_MODEL)).toBe(
      'google/gemini-3.5-flash',
    )
  })

  test('exports flash and pro Gemini image generation models', () => {
    expect(GEMINI_FLASH_IMAGE_MODEL).toEqual({
      provider: 'google',
      model: 'gemini-3.1-flash-image',
    })
    expect(GEMINI_PRO_IMAGE_MODEL).toEqual({
      provider: 'google',
      model: 'gemini-3-pro-image',
    })
  })
})
