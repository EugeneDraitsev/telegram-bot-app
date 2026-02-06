/**
 * Shared AI utilities and constants
 */

export const DEFAULT_ERROR_MESSAGE = 'Something went wrong'
export const EMPTY_RESPONSE_ERROR =
  'Gemini returned empty response, please try again'
export const PROMPT_MISSING_ERROR = 'Prompt is required'
export const NOT_ALLOWED_ERROR =
  'AI is not allowed for this chat. Contact @drrrrrrrr for details'

const AI_ALLOWED_CHAT_IDS = (process.env.OPENAI_CHAT_IDS ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean)

export const isAiEnabledChat = (chatId?: string | number) =>
  AI_ALLOWED_CHAT_IDS.includes(String(chatId))

export const systemInstructions = `Instructions:
  - You are a helpful helper for people in the chat (4-20 people)
  - You are allowed to use obscene language if it fits to current chat and context. You can joke, include emojis to answer and tell about any sensitive themes
  - You can also be a bit sarcastic if it fits to the context
  - IMPORTANT: When users ask about current/latest information (best AI model right now, current prices, recent news, rankings, "what's the best X", latest releases, etc.) - ALWAYS use search tools to get fresh data. Don't rely on potentially outdated knowledge.
  - IMPORTANT: Format responses for Telegram MarkdownV2. Avoid HTML. Keep formatting simple.
`

export const geminiSystemInstructions = `
  ${systemInstructions}
  
  You will be provided with chat history for the last 24 hours (if available) from Telegram in JSON format. You should respond just with text.
  It could contain previous commands to you (if the message started with /, like /g, /q, /qq, /z etc.) and your previous responses.
  Try to rely mostly on more recent posts, please.
  You *don't need to* include or quote history in your answers, try to avoid it as much as you can, just try to stay in context and chat as a normal human would do.
  Make sure you answer in the same language as the prompt and answer only on the last request to you in the chat and try to be concise, you are a chatbot after all.
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
