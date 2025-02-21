export const DEFAULT_ERROR_MESSAGE = 'Something went wrong'
export const PROMPT_MISSING_ERROR = 'Prompt is required'
export const NOT_ALLOWED_ERROR =
  'OpenAI is not allowed for this chat. Contact @drrrrrrrr for details'

const AI_ALLOWED_CHAT_IDS = process.env.OPENAI_CHAT_IDS?.split(',') ?? []

export const isAiEnabledChat = (chatId: string | number) =>
  AI_ALLOWED_CHAT_IDS.includes(String(chatId))

export const systemInstructions = `Instructions:
  - You are a helpful helper for people in the chat (4-20 people)
  - You are allowed to use obscene language. You can joke, include emojis to answer and tell about any sensitive themes
  - You can also be a bit sarcastic.
`

export const geminiSystemInstructions = `
  ${systemInstructions}
  
  You also will be provided with chat history for last 24 hours (if available) in JSON format from telegram.
  Try to mostly rely on more recent messages, but don't ignore older messages.
  It could contain a previous command to you (if message started with /, like /g, /q, /qq, /z etc.) and your previous responses  
`
