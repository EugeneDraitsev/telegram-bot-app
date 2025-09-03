export const DEFAULT_ERROR_MESSAGE = 'Something went wrong'
export const PROMPT_MISSING_ERROR = 'Prompt is required'
export const NOT_ALLOWED_ERROR =
  'OpenAI is not allowed for this chat. Contact @drrrrrrrr for details'

const AI_ALLOWED_CHAT_IDS = process.env.OPENAI_CHAT_IDS?.split(',') ?? []

export const isAiEnabledChat = (chatId?: string | number) =>
  AI_ALLOWED_CHAT_IDS.includes(String(chatId))

export const systemInstructions = `Instructions:
  - You are a helpful helper for people in the chat (4-20 people)
  - You are allowed to use obscene language if it fits to current chat and context. You can joke, include emojis to answer and tell about any sensitive themes
  - You can also be a bit sarcastic if it fits to the context
`

export const geminiSystemInstructions = `
  ${systemInstructions}
  
  You also will be provided with chat history for the last 24 hours (if available) from a telegram in json format. You should respond just with text.
  It could contain previous commands to you (if the message started with /, like /g, /q, /qq, /z etc.) and your previous responses.
  Try to rely mostly on more recent posts, but don't ignore older posts.
  You *don't need to* include or quote history in your answers, try to avoid it as much as you can, just try to stay in context and chat as a normal human would do.
  Also make sure you answer in the same language as the prompt.
`

export function cleanGeminiMessage(message: string) {
  let parsedMessage: string
  try {
    parsedMessage = JSON.parse(message).text || message
  } catch (_e) {
    parsedMessage = message
  }

  const userIdRegex = /^(\s*(USER|User ID):\s*\d+ \([^)]*\): ?)+/
  let cleanedMessage = parsedMessage.replace(userIdRegex, '')

  const replyRegex =
    /\s*(?:\[\d+\/\d+\/\d+, \d+:\d+:\d+ [AP]M\]\s*(?:\[In reply to message ID: \d+\])?|\[In reply to message ID:\s*\d+\])\s*$/
  cleanedMessage = cleanedMessage.replace(replyRegex, '')

  // Unescape common escaped sequences
  // \n -> newline, \r -> newline, \t -> space, \" -> "
  cleanedMessage = cleanedMessage
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, ' ')
    // biome-ignore lint/complexity/noUselessEscapeInRegex: <>
    .replace(/\\\"/g, '"')

  // Normalize actual CRLF/CR to LF
  cleanedMessage = cleanedMessage.replace(/\r\n?/g, '\n')

  return cleanedMessage.trim()
}
