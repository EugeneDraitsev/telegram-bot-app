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

const USER_PREFIX_REGEX =
  /^\s*(?:USER|User ID)\s*:\s*\d+\s*\([^)\r\n]*\)\s*:\s*/i
const REPLY_SUFFIX_REGEX = /\[In reply to message ID:\s*\d+\]\s*$/i
const TIMESTAMP_SUFFIX_REGEX =
  /\[\d{1,4}\/\d{1,2}\/\d{1,4},\s*\d{1,2}:\d{1,2}:\d{1,2}\s*(?:AM|PM)\]\s*$/i

function extractTextPayload(message: string): string {
  try {
    const parsed = JSON.parse(message) as { text?: unknown }
    return typeof parsed.text === 'string' ? parsed.text : message
  } catch {
    return message
  }
}

function removeUserPrefixes(input: string): string {
  let cleaned = input

  while (true) {
    const match = cleaned.match(USER_PREFIX_REGEX)
    if (!match) {
      return cleaned
    }

    cleaned = cleaned.slice(match[0].length)
  }
}

function removeTrailingMetadata(input: string): string {
  let cleaned = input

  while (true) {
    const trimmed = cleaned.trimEnd()
    if (REPLY_SUFFIX_REGEX.test(trimmed)) {
      cleaned = trimmed.replace(REPLY_SUFFIX_REGEX, '')
      continue
    }
    if (TIMESTAMP_SUFFIX_REGEX.test(trimmed)) {
      cleaned = trimmed.replace(TIMESTAMP_SUFFIX_REGEX, '')
      continue
    }
    return trimmed
  }
}

export function cleanGeminiMessage(message: string) {
  let cleanedMessage = removeUserPrefixes(extractTextPayload(message))
  cleanedMessage = removeTrailingMetadata(cleanedMessage)

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
