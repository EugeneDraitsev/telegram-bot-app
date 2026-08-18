import { AsyncLocalStorage } from 'node:async_hooks'
import type { Message } from 'grammy/types'

import {
  acquirePaidMediaCooldown,
  type ChatAdminApi,
  type MediaBuffer,
  type MetricSource,
  type MetricStatus,
  PAID_MEDIA_COOLDOWN_SECONDS,
  timedCall,
} from '@tg-bot/common'
import type { AgentResponse } from '../types'

interface ToolContext {
  message: Message
  api?: ChatAdminApi
  commandName?: string
  getRemainingTimeInMillis?: () => number
  mediaBuffers?: MediaBuffer[]
  paidMediaGenerationClaimed: boolean
  responses: AgentResponse[]
}

const contextStorage = new AsyncLocalStorage<ToolContext>()

export const PAID_MEDIA_DELIVERY_RESERVE_MS = 20_000

interface PaidMediaGenerationOptions {
  maximumRequestTimeoutMs: number
  minimumRequestTimeoutMs: number
}

export function requireToolContext(): ToolContext {
  const context = contextStorage.getStore()
  if (!context) {
    throw new Error('Tool context not set')
  }
  return context
}

export function addResponse(response: AgentResponse): void {
  requireToolContext().responses.push(response)
}

export function getCollectedResponses(): AgentResponse[] {
  return [...(contextStorage.getStore()?.responses ?? [])]
}

export function claimPaidMediaGeneration(): void {
  const context = requireToolContext()
  if (context.paidMediaGenerationClaimed) {
    throw new Error(
      'Only one generated media result can be created per request',
    )
  }

  context.paidMediaGenerationClaimed = true
}

export async function preparePaidMediaGeneration(
  options: PaidMediaGenerationOptions,
): Promise<number> {
  const context = requireToolContext()

  const remainingTimeMs = context.getRemainingTimeInMillis?.()
  const requestTimeoutMs =
    typeof remainingTimeMs === 'number' && Number.isFinite(remainingTimeMs)
      ? Math.min(
          options.maximumRequestTimeoutMs,
          Math.max(
            0,
            Math.trunc(remainingTimeMs - PAID_MEDIA_DELIVERY_RESERVE_MS),
          ),
        )
      : options.maximumRequestTimeoutMs

  if (requestTimeoutMs < options.minimumRequestTimeoutMs) {
    throw new Error(
      'Not enough execution time remains to safely start paid media generation; ask the user to retry in a new message',
    )
  }

  // Reserve synchronously before awaiting Redis so parallel tool calls cannot
  // both enter a billed provider request in the same model round. A cooldown
  // refusal has not started paid work, so release this request-local slot.
  claimPaidMediaGeneration()

  const userId = context.message.from?.id ?? context.message.chat.id
  try {
    if (!(await acquirePaidMediaCooldown(userId))) {
      throw new Error(
        `Paid media generation is limited to once every ${PAID_MEDIA_COOLDOWN_SECONDS} seconds per user; ask the user to retry shortly`,
      )
    }
  } catch (error) {
    context.paidMediaGenerationClaimed = false
    throw error
  }

  return requestTimeoutMs
}

function getToolCommandName(): string | undefined {
  return contextStorage.getStore()?.commandName
}

export function getToolMetricAttribution(): {
  source: MetricSource
  command?: string
} {
  const command = getToolCommandName()
  return command ? { source: 'command', command } : { source: 'agentic' }
}

export async function trackToolModelCall<T>(
  options: {
    name: string
    model: string
    fallbackFrom?: string
    attribution?: { source: MetricSource; command?: string }
    classifyResult?: (result: T) => MetricStatus
    getOutputTokensByModality?: (
      result: T,
    ) => Record<string, number> | undefined
  },
  fn: () => Promise<T>,
): Promise<T> {
  const { message } = requireToolContext()
  const { attribution, ...metricOptions } = options
  return timedCall(
    {
      type: 'model_call',
      ...(attribution ?? getToolMetricAttribution()),
      ...metricOptions,
      chatId: message.chat.id,
    },
    fn,
  )
}

export async function withToolMediaBuffers<T>(
  mediaBuffers: MediaBuffer[] | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  const context = requireToolContext()
  const previousMediaBuffers = context.mediaBuffers
  context.mediaBuffers = mediaBuffers

  try {
    return await callback()
  } finally {
    context.mediaBuffers = previousMediaBuffers
  }
}

export async function runWithToolContext<T>(
  message: Message,
  mediaBuffers: MediaBuffer[] | undefined,
  callback: () => Promise<T>,
  api?: ChatAdminApi,
  commandName?: string,
  getRemainingTimeInMillis?: () => number,
): Promise<T> {
  return contextStorage.run(
    {
      message,
      api,
      commandName,
      getRemainingTimeInMillis,
      mediaBuffers,
      paidMediaGenerationClaimed: false,
      responses: [],
    },
    callback,
  )
}
