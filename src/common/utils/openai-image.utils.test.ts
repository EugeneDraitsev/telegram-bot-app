import {
  buildOpenAiImagePrompt,
  isOpenAiGptImageModel,
  OPENAI_GPT_IMAGE_MODEL,
  OPENAI_GPT_IMAGE_SIZE,
  usesOpenAiMediumImageQuality,
} from './openai-image.utils'

describe('openai-image.utils', () => {
  test('exports chatgpt image latest as the default OpenAI image model', () => {
    expect(OPENAI_GPT_IMAGE_MODEL).toBe('gpt-image-2')
  })

  test('uses auto size for GPT image models', () => {
    expect(OPENAI_GPT_IMAGE_SIZE).toBe('auto')
  })

  test('recognizes GPT image model names including chatgpt image latest', () => {
    expect(isOpenAiGptImageModel(OPENAI_GPT_IMAGE_MODEL)).toBe(true)
    expect(isOpenAiGptImageModel('gpt-image-2')).toBe(true)
    expect(isOpenAiGptImageModel('dall-e-3')).toBe(false)
  })

  test('uses medium quality for the supported GPT image defaults', () => {
    expect(usesOpenAiMediumImageQuality(OPENAI_GPT_IMAGE_MODEL)).toBe(true)
    expect(usesOpenAiMediumImageQuality('gpt-image-2')).toBe(true)
    expect(usesOpenAiMediumImageQuality('dall-e-3')).toBe(false)
  })

  test('adds anti-crop composition guidance to prompt', () => {
    const prompt = buildOpenAiImagePrompt('Draw album cover art')

    expect(prompt).toContain('Draw album cover art')
    expect(prompt).toContain('Composition note:')
    expect(prompt).toContain('Do not accidentally crop')
    expect(prompt).toContain('cover art')
  })

  test('returns empty string for blank prompt', () => {
    expect(buildOpenAiImagePrompt('   ')).toBe('')
  })
})
