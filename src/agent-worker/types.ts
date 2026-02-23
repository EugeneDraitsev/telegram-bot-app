/**
 * Types for Agent Worker.
 *
 * Tools collect responses and the agent loop delivers them at the end.
 */

import { Type } from '@google/genai'
import type { FunctionDeclaration } from '@google/genai'

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
    options?: { reply_parameters?: { message_id: number } },
  ) => Promise<unknown>
  sendAnimation: (
    chatId: number,
    animation: unknown,
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
  sendChatAction?: (
    chatId: number,
    action: 'typing' | 'upload_photo' | 'upload_video' | 'record_voice',
  ) => Promise<unknown>
  setMessageReaction?: (
    chatId: number,
    messageId: number,
    reaction: unknown[],
  ) => Promise<unknown>
}

export interface TextResponse {
  type: 'text'
  text: string
  parseMode?: 'HTML' | 'MarkdownV2'
}

export interface ImageResponse {
  type: 'image'
  url?: string
  buffer?: Buffer
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

/**
 * Tool definition for native @google/genai function calling.
 * Each tool has a declaration (schema for the model) and an execute function.
 */
export interface AgentTool {
  declaration: FunctionDeclaration
  execute: (args: Record<string, unknown>) => Promise<string>
  /** Override default tool timeout (ms). Used for slow tools like image generation. */
  timeoutMs?: number
}

export { Type }
