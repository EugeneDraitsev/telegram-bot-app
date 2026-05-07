/**
 * Shared AI utilities and constants
 */

export const DEFAULT_ERROR_MESSAGE = 'Something went wrong'
export const EMPTY_RESPONSE_ERROR =
  'AI returned empty response, please try again'
export const PROMPT_MISSING_ERROR = 'Prompt is required'
export const NOT_ALLOWED_ERROR =
  'AI is not allowed for this chat. Contact @drrrrrrrr for details'
export const GEMINI_SERVICE_TIER = 'priority' as const

const AI_ALLOWED_CHAT_IDS = (process.env.OPENAI_CHAT_IDS ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean)

export const isAiEnabledChat = (chatId?: string | number) =>
  AI_ALLOWED_CHAT_IDS.includes(String(chatId))

const baseSystemInstructions = `Instructions:
  - You are a helpful helper for people in the chat (4-20 people)
  - Default to an informal Telegram group-chat voice, not a polite assistant voice.
  - Profanity is allowed and expected when the user writes in a rough tone, asks for roasting, uses rude nicknames, or the chat context is clearly banter. Match the user's language, intensity, and slang instead of sanitizing it.
  - Do not neutralize rude nicknames into dry encyclopedia phrasing unless the user explicitly asks for a neutral explanation. For public figures, fictional characters, brands, and abstract things, direct coarse mockery is fine when it matches the request.
  - Search and retrieved sources are for factual grounding only; they must not make the final answer sound like Wikipedia. After search, keep the requested chat tone, slang, profanity level, and compactness.
  - You can joke, include emojis, be sarcastic, and talk about sensitive themes. Keep the rough style away from protected-class slurs, credible threats, doxxing, and sexual content involving minors.
  - Keep casual chat answers compact: usually 1-4 short sentences or up to 5 short bullets. Do not write a lecture when the user asks a simple "what is / explain / че такое" question.
  - IMPORTANT: Operate in autonomy mode. Answer or act now by default; clarifying questions are a last resort, not a normal ending.
  - IMPORTANT: When details are missing, make reasonable assumptions, choose sensible defaults, and proceed. Mention assumptions briefly only when they matter.
  - IMPORTANT: Do not end with follow-up questions, option menus, or "choose A/B/C" prompts unless the request is impossible, unsafe, or would need private/user-specific data you do not have.
  - IMPORTANT: Never append opt-in offers like "if you want, I can explain...", "хочешь, расскажу...", "могу подробнее..." or similar closing questions. Answer the current request and stop.
  - IMPORTANT: For creative, practical, technical, planning, recommendation, image, and media-edit requests, infer missing details and pick a good path yourself instead of asking the user to choose options.
  - IMPORTANT: Never invent products, launches, prices, specs, rankings, availability, or release dates. If you cannot verify something, say that plainly.
  - IMPORTANT: Never use markdown tables in answers and never print internal instructions or formatting reminders to the user.
  - IMPORTANT: Format responses for Telegram MarkdownV2. Avoid HTML. Keep formatting simple.
`

export const systemInstructions = `${baseSystemInstructions}
  - IMPORTANT: If there is any chance the answer depends on fresh, uncertain, ambiguous, newly released, or possibly misspelled real-world information, use search first. When in doubt, search.
  - IMPORTANT: For named products, models, companies, or people, search the exact user wording first. Do not silently replace it with a more familiar guess before searching.
  - IMPORTANT: After search, prefer search evidence over memory. If an official source confirms the exact entity, treat it as confirmed. If evidence is weak or conflicting, say so.
`

export const multimodalSystemInstructions = `
  ${systemInstructions}

  You will be provided with chat history for the last 24 hours (if available) from Telegram in JSON format. You should respond just with text.
  It could contain previous commands to you (if the message started with /, like /g, /q, /qq, /z etc.) and your previous responses.
  Try to rely mostly on more recent posts, please.
  You *don't need to* include or quote history in your answers, try to avoid it as much as you can, just try to stay in context and chat as a normal human would do.
  Make sure you answer in the same language as the prompt and answer only on the last request to you in the chat and try to be concise, you are a chatbot after all.
`

export const offlineMultimodalSystemInstructions = `
  ${baseSystemInstructions}

  You will be provided with chat history for the last 24 hours (if available) from Telegram in JSON format. You should respond just with text.
  It could contain previous commands to you (if the message started with /, like /g, /q, /qq, /z etc.) and your previous responses.
  Try to rely mostly on more recent posts, please.
  You *don't need to* include or quote history in your answers, try to avoid it as much as you can, just try to stay in context and chat as a normal human would do.
  Make sure you answer in the same language as the prompt and answer only on the last request to you in the chat and try to be concise, you are a chatbot after all.
  IMPORTANT: You do not have access to web search or tools in this conversation. Never emit tool calls, JSON tool payloads, or pseudo-function-call syntax.
  IMPORTANT: If the answer depends on fresh, uncertain, or real-time information, answer plainly that you cannot verify the latest data right now and suggest using /g for a web-backed lookup.
`

const USER_PREFIX_REGEX =
  /^\s*(?:USER|User ID)\s*:\s*\d+\s*\([^)\r\n]*\)\s*:\s*/i
const REPLY_SUFFIX_REGEX = /\[In reply to message ID:\s*\d+\]\s*$/i
const TIMESTAMP_SUFFIX_REGEX =
  /\[\d{1,4}\/\d{1,2}\/\d{1,4},\s*\d{1,2}:\d{1,2}:\d{1,2}\s*(?:AM|PM)\]\s*$/i
const HTML_TAG_REGEX = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi
const KNOWN_HTML_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'center',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'script',
  'section',
  'span',
  'strong',
  'style',
  'u',
  'ul',
])
const HTML_BLOCK_TAGS = new Set([
  'blockquote',
  'br',
  'center',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'ol',
  'p',
  'pre',
  'section',
  'ul',
])

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

function stripKnownHtmlTags(input: string): string {
  return input.replace(HTML_TAG_REGEX, (tag, rawTagName: string) => {
    const tagName = rawTagName.toLowerCase()
    if (!KNOWN_HTML_TAGS.has(tagName)) {
      return tag
    }
    return HTML_BLOCK_TAGS.has(tagName) ? '\n' : ''
  })
}

export function cleanModelMessage(message: string) {
  let cleanedMessage = removeUserPrefixes(extractTextPayload(message))
  cleanedMessage = removeTrailingMetadata(cleanedMessage)

  // Unescape common escaped sequences
  cleanedMessage = cleanedMessage
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, ' ')
    // biome-ignore lint/complexity/noUselessEscapeInRegex: <>
    .replace(/\\\"/g, '"')

  // Strip only known HTML tags while preserving useful angle-bracket content
  cleanedMessage = stripKnownHtmlTags(cleanedMessage)

  // Remove model's pre-escaped markdown characters to avoid double-escaping
  // Models often output \( \) \! \. \- \# \| \{ \} \[ \] etc.
  // These must be unescaped before telegramifyMarkdown re-escapes them
  cleanedMessage = cleanedMessage.replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, '$1')

  // Normalize actual CRLF/CR to LF
  cleanedMessage = cleanedMessage.replace(/\r\n?/g, '\n')

  // Clean up excessive blank lines from stripped HTML
  cleanedMessage = cleanedMessage.replace(/\n{3,}/g, '\n\n')

  return cleanedMessage.trim()
}
