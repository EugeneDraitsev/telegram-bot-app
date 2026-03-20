import type { Context } from 'grammy/web'

import { handlePhotoMessage } from '../photo-router'

const setupMultimodalGeminiCommandsMock = jest.fn((..._args: unknown[]) =>
  Promise.resolve(undefined),
)
const setupImageGenerationGeminiCommandsMock = jest.fn((..._args: unknown[]) =>
  Promise.resolve(undefined),
)
const setupImageGenerationOpenAiCommandsMock = jest.fn((..._args: unknown[]) =>
  Promise.resolve(undefined),
)

jest.mock('../google', () => ({
  GEMMA_MODEL: 'gemma-3-12b-it',
  setupMultimodalGeminiCommands: (...args: unknown[]) =>
    setupMultimodalGeminiCommandsMock(...args),
  setupImageGenerationGeminiCommands: (...args: unknown[]) =>
    setupImageGenerationGeminiCommandsMock(...args),
}))

jest.mock('../open-ai', () => ({
  setupImageGenerationOpenAiCommands: (...args: unknown[]) =>
    setupImageGenerationOpenAiCommandsMock(...args),
}))

describe('handlePhotoMessage', () => {
  beforeEach(() => {
    setupMultimodalGeminiCommandsMock.mockClear()
    setupImageGenerationGeminiCommandsMock.mockClear()
    setupImageGenerationOpenAiCommandsMock.mockClear()
  })

  test('routes /gemma photo captions to Google Gemma handler', async () => {
    const ctx = {
      message: { caption: '/gemma describe this image' },
    } as unknown as Context

    const handled = await handlePhotoMessage(ctx, true)

    expect(handled).toBe(true)
    expect(setupMultimodalGeminiCommandsMock).toHaveBeenCalledWith(
      ctx,
      true,
      'gemma-3-12b-it',
    )
    expect(setupImageGenerationGeminiCommandsMock).not.toHaveBeenCalled()
    expect(setupImageGenerationOpenAiCommandsMock).not.toHaveBeenCalled()
  })

  test('keeps /ge routed to Gemini image generation', async () => {
    const ctx = {
      message: { caption: '/ge draw a cat' },
    } as unknown as Context

    const handled = await handlePhotoMessage(ctx, false)

    expect(handled).toBe(true)
    expect(setupImageGenerationGeminiCommandsMock).toHaveBeenCalledWith(
      ctx,
      false,
    )
    expect(setupMultimodalGeminiCommandsMock).not.toHaveBeenCalled()
    expect(setupImageGenerationOpenAiCommandsMock).not.toHaveBeenCalled()
  })
})
