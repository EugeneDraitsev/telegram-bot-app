import OpenAi from 'openai'

let client: OpenAi | null = null

export function getOpenAiClient(): OpenAi {
  if (client) return client

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  client = new OpenAi({ apiKey })
  return client
}

export function resetOpenAiClientForTests() {
  client = null
}
