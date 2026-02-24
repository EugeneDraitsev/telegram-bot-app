// Agent configuration constants

// Delivery
export const MAX_CAPTION_LENGTH = 1024
export const MAX_TEXT_LENGTH = 4096

// Tool execution
export const MAX_TOOL_ITERATIONS = 3
export const TOOL_CALL_TIMEOUT_MS = 20_000
export const TERMINAL_TOOLS = new Set([
  'telegram_dice',
  'magic_8_ball',
  'search_gif',
  'animate_text',
  'generate_voice',
  'get_weather',
])

/** Tools that create content — must run AFTER data-gathering tools.
 *  If a round has both data + content tools, only data tools execute;
 *  content tools are deferred to the next round. */
export const CONTENT_TOOLS = new Set([
  'generate_voice',
  'generate_or_edit_image',
  'animate_text',
])

// Model retry
export const MAX_RETRIES = 2
export const RETRY_BASE_DELAY_MS = 1_000

// Reply gate
export const REPLY_GATE_TIMEOUT_MS = 15_000
