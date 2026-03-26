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
  parameters?: {
    type: 'object'
    properties: Record<
      string,
      {
        type: 'string' | 'number' | 'boolean' | 'integer' | 'array'
        description?: string
        enum?: string[]
        items?: { type: string }
      }
    >
    required?: string[]
  }
}

export interface AgentTool {
  declaration: InteractionFunctionTool
  execute: (args: Record<string, unknown>) => Promise<string>
  /** Override default tool timeout (ms). Used for slow tools like image generation. */
  timeoutMs?: number
}
