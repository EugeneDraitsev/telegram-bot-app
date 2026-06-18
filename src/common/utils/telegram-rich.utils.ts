import type { Api } from 'grammy'
import type { Message } from 'grammy/types'

import { logger } from '../logger'

export const THINKING_DRAFT_REFRESH_INTERVAL_MS = 25_000

type RichCapableApi = Partial<
  Pick<Api, 'sendRichMessage' | 'sendRichMessageDraft' | 'sendMessage'>
>
type SendRichMessageOptions = Parameters<Api['sendRichMessage']>[2]
type SendMessageOptions = Parameters<Api['sendMessage']>[2]
type SendRichMessageDraftOptions = Parameters<Api['sendRichMessageDraft']>[3]
type SendRichMessageSignal = Parameters<Api['sendRichMessage']>[3]
type SendRichMessageDraftSignal = Parameters<Api['sendRichMessageDraft']>[4]

function getSendRichMessageMethod(api: RichCapableApi) {
  if (typeof api.sendRichMessage !== 'function') {
    throw new Error('Telegram API sendRichMessage method is not available')
  }

  return api.sendRichMessage.bind(api) as Api['sendRichMessage']
}

function getSendRichMessageDraftMethod(api: RichCapableApi) {
  if (typeof api.sendRichMessageDraft !== 'function') {
    throw new Error('Telegram API sendRichMessageDraft method is not available')
  }

  return api.sendRichMessageDraft.bind(api) as Api['sendRichMessageDraft']
}

function getSendMessageMethod(api: RichCapableApi) {
  if (typeof api.sendMessage !== 'function') {
    throw new Error('Telegram API sendMessage method is not available')
  }

  return api.sendMessage.bind(api) as Api['sendMessage']
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
  chatId: number | string,
  richMessage: Parameters<Api['sendRichMessage']>[1],
  options?: SendRichMessageOptions,
  signal?: SendRichMessageSignal,
) {
  return getSendRichMessageMethod(api)(chatId, richMessage, options, signal)
}

export async function sendRichMessageDraft(
  api: RichCapableApi,
  chatId: number,
  draftId: number,
  richMessage: Parameters<Api['sendRichMessageDraft']>[2],
  options?: SendRichMessageDraftOptions,
  signal?: SendRichMessageDraftSignal,
) {
  return getSendRichMessageDraftMethod(api)(
    chatId,
    draftId,
    richMessage,
    options,
    signal,
  )
}

export async function sendRichMessageWithFallback(params: {
  api: RichCapableApi
  chatId: number | string
  richMessage: Parameters<Api['sendRichMessage']>[1]
  fallbackText: string
  richOptions?: SendRichMessageOptions
  fallbackOptions?: SendMessageOptions
}) {
  const {
    api,
    chatId,
    richMessage,
    fallbackText,
    richOptions,
    fallbackOptions = richOptions,
  } = params

  const effectiveFallbackOptions =
    fallbackOptions ?? (richOptions as SendMessageOptions | undefined)

  try {
    return await sendRichMessage(api, chatId, richMessage, richOptions)
  } catch (error) {
    logger.warn({ chatId, error }, 'telegram.rich_message_failed')
    return getSendMessageMethod(api)(
      chatId,
      fallbackText,
      effectiveFallbackOptions,
    )
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
    await sendRichMessageDraft(api, chatId, draftId, {
      html: `<tg-thinking>${escapeHtml(text)}</tg-thinking>`,
      skip_entity_detection: true,
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
