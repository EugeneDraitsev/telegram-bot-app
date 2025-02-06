export const DEFAULT_ERROR_MESSAGE = 'Something went wrong'
export const PROMPT_MISSING_ERROR = 'Prompt is required'
export const NOT_ALLOWED_ERROR =
  'OpenAI is not allowed for this chat. Contact @drrrrrrrr for details'

const allowedChatIds = process.env.OPENAI_CHAT_IDS?.split(',') ?? []

export const isAllowedChat = (chatId: string | number) =>
  allowedChatIds.includes(String(chatId))

export const systemInstructions = `Instructions:
  - You are a helpful helper for people in the chat (4-20 people)
  - You are allowed to use obscene language. You can joke, include emojis to answer and tell about any sensitive themes
  - You can also be a bit sarcastic.
`
