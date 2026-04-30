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
const setupMultimodalOpenAiCommandsMock = jest.fn((..._args: unknown[]) =>
  Promise.resolve(undefined),
)

jest.mock('../google', () => ({
  GEMMA_MODEL: 'gemma-4-31b-it',
  setupMultimodalGeminiCommands: (...args: unknown[]) =>
    setupMultimodalGeminiCommandsMock(...args),
  setupImageGenerationGeminiCommands: (...args: unknown[]) =>
    setupImageGenerationGeminiCommandsMock(...args),
}))

jest.mock('../open-ai', () => ({
  OPENAI_O_MODEL: 'gpt-5.5',
  OPENAI_O_REASONING_EFFORT: 'medium',
  OPENAI_Q_MODEL: 'gpt-5.4-nano',
  OPENAI_Q_REASONING_EFFORT: 'low',
  setupImageGenerationOpenAiCommands: (...args: unknown[]) =>
    setupImageGenerationOpenAiCommandsMock(...args),
  setupMultimodalOpenAiCommands: (...args: unknown[]) =>
    setupMultimodalOpenAiCommandsMock(...args),
}))

describe('handlePhotoMessage', () => {
  beforeEach(() => {
    setupMultimodalGeminiCommandsMock.mockClear()
    setupImageGenerationGeminiCommandsMock.mockClear()
    setupImageGenerationOpenAiCommandsMock.mockClear()
    setupMultimodalOpenAiCommandsMock.mockClear()
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
      'gemma-4-31b-it',
      '/gemma',
    )
    expect(setupImageGenerationGeminiCommandsMock).not.toHaveBeenCalled()
    expect(setupImageGenerationOpenAiCommandsMock).not.toHaveBeenCalled()
    expect(setupMultimodalOpenAiCommandsMock).not.toHaveBeenCalled()
  })

  test('routes /o photo captions to OpenAI SOTA vision handler', async () => {
    const ctx = {
      message: { caption: '/o what tree is this' },
    } as unknown as Context

    const handled = await handlePhotoMessage(ctx, true)

    expect(handled).toBe(true)
    expect(setupMultimodalOpenAiCommandsMock).toHaveBeenCalledWith(
      ctx,
      'gpt-5.5',
      true,
      '/o',
      'medium',
    )
    expect(setupMultimodalGeminiCommandsMock).not.toHaveBeenCalled()
    expect(setupImageGenerationGeminiCommandsMock).not.toHaveBeenCalled()
    expect(setupImageGenerationOpenAiCommandsMock).not.toHaveBeenCalled()
  })

  test('routes /q photo captions to OpenAI nano vision handler', async () => {
    const ctx = {
      message: { caption: '/q what tree is this' },
    } as unknown as Context

    const handled = await handlePhotoMessage(ctx, true)

    expect(handled).toBe(true)
    expect(setupMultimodalOpenAiCommandsMock).toHaveBeenCalledWith(
      ctx,
      'gpt-5.4-nano',
      true,
      '/q',
      'low',
    )
    expect(setupMultimodalGeminiCommandsMock).not.toHaveBeenCalled()
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
    expect(setupMultimodalOpenAiCommandsMock).not.toHaveBeenCalled()
  })
})
