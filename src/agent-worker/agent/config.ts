// Agent configuration constants

// Delivery
export const MAX_CAPTION_LENGTH = 1024
export const MAX_TEXT_LENGTH = 4096

// Worker deadline
/** Left after the tool loop to deliver the answer or the failure notice. */
export const DELIVERY_RESERVE_MS = 60_000

// Tool execution
export const MAX_SERIAL_TOOL_CALLS_PER_ROUND = 2
export const TOOL_CALL_TIMEOUT_MS = 25_000

// Model retry
export const MAX_RETRIES = 1
export const RETRY_BASE_DELAY_MS = 1_000
