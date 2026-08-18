import {
  getAiSdkGoogleProvider,
  getAiSdkProviderOptions,
  resetAiSdkProvidersForTests,
} from './ai-sdk.utils'

const originalGeminiApiKey = process.env.GEMINI_API_KEY
const originalGoogleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY

describe('ai-sdk.utils', () => {
  afterEach(() => {
    process.env.GEMINI_API_KEY = originalGeminiApiKey
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalGoogleApiKey
    resetAiSdkProvidersForTests()
  })

  test('mentions both supported Google API key env vars', () => {
    delete process.env.GEMINI_API_KEY
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY

    expect(() => getAiSdkGoogleProvider()).toThrow(
      'GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY is not set',
    )
  })

  test('passes unsupported OpenAI file types through when requested', () => {
    expect(
      getAiSdkProviderOptions(
        { provider: 'openai', model: 'gpt-5.6-luna' },
        { passThroughUnsupportedFiles: true },
      ).openai?.passThroughUnsupportedFiles,
    ).toBe(true)
  })
})
