import { buildImageGenerationPrompt } from './image-prompt.utils'

describe('image-prompt.utils', () => {
  test('adds anti-crop composition guidance to prompt', () => {
    const prompt = buildImageGenerationPrompt('Draw album cover art')

    expect(prompt).toContain('Draw album cover art')
    expect(prompt).toContain('Composition note:')
    expect(prompt).toContain('Do not accidentally crop')
    expect(prompt).toContain('cover art')
  })

  test('returns empty string for blank prompt', () => {
    expect(buildImageGenerationPrompt('   ')).toBe('')
  })
})
