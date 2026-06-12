import type { Message } from 'telegram-typings'

import { logger } from '../logger'

export const THINKING_DRAFT_REFRESH_INTERVAL_MS = 25_000

export interface InputRichMessage {
  html?: string
  markdown?: string
  is_rtl?: boolean
  skip_entity_detection?: boolean
}

type TelegramRawMethod = (
  payload: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<unknown>

type RichCapableApi = {
  raw?: Record<string, unknown>
  sendMessage?: unknown
}

interface SendRichMessagePayload {
  chat_id: number | string
  rich_message: InputRichMessage
  business_connection_id?: string
  message_thread_id?: number
  direct_messages_topic_id?: number
  disable_notification?: boolean
  protect_content?: boolean
  allow_paid_broadcast?: boolean
  message_effect_id?: string
  suggested_post_parameters?: unknown
  reply_parameters?: unknown
  reply_markup?: unknown
}

interface SendRichMessageDraftPayload {
  chat_id: number
  draft_id: number
  rich_message: InputRichMessage
  message_thread_id?: number
}

type SendMessageMethod = (
  chatId: number | string,
  text: string,
  options?: Record<string, unknown>,
) => Promise<unknown>

function getRawMethod(api: RichCapableApi, methodName: string) {
  const raw = api.raw
  const method = raw?.[methodName]

  if (typeof method !== 'function') {
    throw new Error(`Telegram raw API method ${methodName} is not available`)
  }

  return method.bind(raw) as TelegramRawMethod
}

function getSendMessageMethod(api: RichCapableApi) {
  if (typeof api.sendMessage !== 'function') {
    throw new Error('Telegram API sendMessage method is not available')
  }

  return api.sendMessage.bind(api) as SendMessageMethod
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function sendRichMessage(
  api: RichCapableApi,
  payload: SendRichMessagePayload,
  signal?: AbortSignal,
) {
  return getRawMethod(api, 'sendRichMessage')(
    payload as unknown as Record<string, unknown>,
    signal,
  )
}

export async function sendRichMessageDraft(
  api: RichCapableApi,
  payload: SendRichMessageDraftPayload,
  signal?: AbortSignal,
) {
  return getRawMethod(api, 'sendRichMessageDraft')(
    payload as unknown as Record<string, unknown>,
    signal,
  )
}

export async function sendRichMessageWithFallback(params: {
  api: RichCapableApi
  chatId: number | string
  richMessage: InputRichMessage
  fallbackText: string
  richOptions?: Omit<SendRichMessagePayload, 'chat_id' | 'rich_message'>
  fallbackOptions?: Record<string, unknown>
}) {
  const {
    api,
    chatId,
    richMessage,
    fallbackText,
    richOptions,
    fallbackOptions = richOptions,
  } = params

  try {
    return await sendRichMessage(api, {
      chat_id: chatId,
      rich_message: richMessage,
      ...richOptions,
    })
  } catch (error) {
    logger.warn({ chatId, error }, 'telegram.rich_message_failed')
    return getSendMessageMethod(api)(chatId, fallbackText, fallbackOptions)
  }
}

export async function sendThinkingRichDraft(params: {
  api: RichCapableApi
  message: Message
  text?: string
  onError?: (error: unknown) => void
}) {
  const { api, message, text = 'Thinking...', onError } = params
  const chatId = message.chat?.id

  if (message.chat?.type !== 'private' || typeof chatId !== 'number') {
    return false
  }

  const draftId = message.message_id || 1

  try {
    await sendRichMessageDraft(api, {
      chat_id: chatId,
      draft_id: draftId,
      rich_message: {
        html: `<tg-thinking>${escapeHtml(text)}</tg-thinking>`,
        skip_entity_detection: true,
      },
    })
    return true
  } catch (error) {
    onError?.(error)
    return false
  }
}

export function startThinkingRichDraftIndicator(params: {
  api: RichCapableApi
  message: Message
  text?: string
  intervalMs?: number
  onError?: (error: unknown) => void
}) {
  const {
    api,
    message,
    text,
    intervalMs = THINKING_DRAFT_REFRESH_INTERVAL_MS,
    onError,
  } = params
  const chatId = message.chat?.id

  if (message.chat?.type !== 'private' || typeof chatId !== 'number') {
    return () => {}
  }

  let stopped = false
  let interval: ReturnType<typeof setInterval> | undefined
  let inFlight = false

  const stop = () => {
    if (stopped) {
      return
    }

    stopped = true
    if (interval) {
      clearInterval(interval)
    }
  }

  const refresh = async () => {
    if (stopped || inFlight) {
      return true
    }

    inFlight = true
    try {
      const ok = await sendThinkingRichDraft({ api, message, text, onError })
      if (!ok) {
        stop()
      }
      return ok
    } finally {
      inFlight = false
    }
  }

  interval = setInterval(() => {
    void refresh()
  }, intervalMs)
  interval.unref?.()

  void refresh()

  return stop
}
