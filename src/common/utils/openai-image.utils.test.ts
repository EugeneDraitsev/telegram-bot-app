import {
  buildOpenAiImagePrompt,
  OPENAI_GPT_IMAGE_SIZE,
} from './openai-image.utils'

describe('openai-image.utils', () => {
  test('uses auto size for GPT image models', () => {
    expect(OPENAI_GPT_IMAGE_SIZE).toBe('auto')
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
