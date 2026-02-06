/**
 * Types for Agent Worker.
 *
 * Tools collect responses and the agent loop delivers them at the end.
 */

import type { BaseMessageLike } from '@langchain/core/messages'

export type AgentChatMessage = BaseMessageLike

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
  sendVideoNote: (
    chatId: number,
    videoNote: unknown,
    options?: { reply_parameters?: { message_id: number } },
  ) => Promise<unknown>
  sendChatAction?: (
    chatId: number,
    action: 'typing' | 'upload_photo' | 'upload_video' | 'record_voice',
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

export interface VoiceResponse {
  type: 'voice'
  buffer: Buffer
}

export interface VideoNoteResponse {
  type: 'video_note'
  buffer: Buffer
}

export type AgentResponse =
  | TextResponse
  | ImageResponse
  | VideoResponse
  | VoiceResponse
  | VideoNoteResponse

export interface ToolResult {
  success: boolean
  message: string
  response?: AgentResponse
}

export interface ResponseCollector {
  responses: AgentResponse[]
  add(response: AgentResponse): void
  hasResponses(): boolean
  getAll(): AgentResponse[]
  clear(): void
}

export function createResponseCollector(): ResponseCollector {
  const responses: AgentResponse[] = []

  return {
    responses,
    add(response: AgentResponse) {
      responses.push(response)
    },
    hasResponses() {
      return responses.length > 0
    },
    getAll() {
      return [...responses]
    },
    clear() {
      responses.length = 0
    },
  }
}
