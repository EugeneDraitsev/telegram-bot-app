import type { JSONSchema7 } from 'ai'
import type { Api } from 'grammy'

/**
 * Types for Agent Worker.
 *
 * Tools collect responses and the agent loop delivers them at the end.
 * Tool declarations use the Interactions API format (type: 'function').
 */

type TelegramApiMethods = Pick<
  Api,
  | 'getFile'
  | 'sendMessage'
  | 'sendPhoto'
  | 'sendVoice'
  | 'sendVideo'
  | 'sendAnimation'
  | 'sendSticker'
  | 'sendDice'
  | 'sendChatAction'
  | 'sendRichMessage'
  | 'sendRichMessageDraft'
  | 'setMessageReaction'
>

export type TelegramApi = Omit<TelegramApiMethods, 'setMessageReaction'> & {
  setMessageReaction?: TelegramApiMethods['setMessageReaction']
}

// ── Responses ────────────────────────────────────────────────

export interface TextResponse {
  type: 'text'
  text: string
}
export interface RichResponse {
  type: 'rich'
  richMessage: Parameters<Api['sendRichMessage']>[1]
  fallbackText: string
}
export interface ImageResponse {
  type: 'image'
  buffer?: Buffer
  url?: string
  caption?: string
}
export interface VideoResponse {
  type: 'video'
  url: string
  caption?: string
}
export interface AnimationResponse {
  type: 'animation'
  url: string
  caption?: string
}
export interface VoiceResponse {
  type: 'voice'
  buffer: Buffer
}
export interface StickerResponse {
  type: 'sticker'
  fileId: string
}
export interface DiceResponse {
  type: 'dice'
  emoji: string
}

export type AgentResponse =
  | TextResponse
  | RichResponse
  | ImageResponse
  | VideoResponse
  | AnimationResponse
  | VoiceResponse
  | StickerResponse
  | DiceResponse

// ── Tool Declarations (Interactions API format) ──────────────

/** Interactions API function tool declaration */
export interface InteractionFunctionTool {
  type: 'function'
  name: string
  description: string
  parameters?: JSONSchema7
}

export interface AgentTool {
  declaration: InteractionFunctionTool
  execute: (args: Record<string, unknown>) => Promise<string>
  /** Override default tool timeout (ms). Used for slow tools like image generation. */
  timeoutMs?: number
  /** Internal tools can be executable without being exposed to the main model. */
  exposeToModel?: boolean
}
