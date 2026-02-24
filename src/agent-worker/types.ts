/**
 * Types for Agent Worker.
 *
 * Tools collect responses and the agent loop delivers them at the end.
 * Tool declarations use the Interactions API format (type: 'function').
 */

export interface TelegramApi {
  sendMessage: (
    chatId: number,
    text: string,
    options?: {
      reply_parameters?: { message_id: number }
      parse_mode?: string
    },
  ) => Promise<unknown>
  sendPhoto: (
    chatId: number,
    photo: unknown,
    options?: {
      caption?: string
      parse_mode?: string
      reply_parameters?: { message_id: number }
    },
  ) => Promise<unknown>
  sendVoice: (
    chatId: number,
    voice: unknown,
    options?: {
      caption?: string
      parse_mode?: string
      reply_parameters?: { message_id: number }
    },
  ) => Promise<unknown>
  sendVideo: (
    chatId: number,
    video: string,
    options?: {
      caption?: string
      parse_mode?: string
      reply_parameters?: { message_id: number }
    },
  ) => Promise<unknown>
  sendAnimation: (
    chatId: number,
    animation: string,
    options?: {
      caption?: string
      parse_mode?: string
      reply_parameters?: { message_id: number }
    },
  ) => Promise<unknown>
  sendSticker: (
    chatId: number,
    sticker: string,
    options?: { reply_parameters?: { message_id: number } },
  ) => Promise<unknown>
  sendDice: (
    chatId: number,
    emoji: string,
    options?: { reply_parameters?: { message_id: number } },
  ) => Promise<unknown>
  sendChatAction: (
    chatId: number,
    action: 'typing' | 'upload_photo' | 'upload_video' | 'record_voice',
  ) => Promise<unknown>
  setMessageReaction?: (
    chatId: number,
    messageId: number,
    reaction: unknown[],
  ) => Promise<unknown>
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
