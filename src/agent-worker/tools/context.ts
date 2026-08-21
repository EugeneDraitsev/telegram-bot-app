import { AsyncLocalStorage } from 'node:async_hooks'
import type { Message } from 'grammy/types'

import {
  type ChatAdminApi,
  type MediaBuffer,
  type MediaResolverApi,
  type MetricSource,
  type MetricStatus,
  timedCall,
} from '@tg-bot/common'
import type { AgentResponse } from '../types'

export const MAX_MODEL_INSPECTION_IMAGES = 4

export interface RegisteredToolMedia {
  media: MediaBuffer
  mediaId: number
}

interface ToolContext {
  message: Message
  api?: ChatAdminApi & Partial<MediaResolverApi>
  commandName?: string
  generatedMediaClaimed: boolean
  historyMessages: Message[]
  mediaBuffers?: MediaBuffer[]
  pendingModelInspectionImages: RegisteredToolMedia[]
  inspectedModelMediaIds: Set<number>
  responses: AgentResponse[]
}

const contextStorage = new AsyncLocalStorage<ToolContext>()

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

export function registerToolMediaBuffers(
  additions: MediaBuffer[],
): RegisteredToolMedia[] {
  const context = requireToolContext()
  const mediaBuffers = context.mediaBuffers ?? []
  context.mediaBuffers = mediaBuffers

  return additions.map((media) => {
    const existingIndex = mediaBuffers.findIndex(
      (candidate) =>
        (media.fileUniqueId && candidate.fileUniqueId === media.fileUniqueId) ||
        (media.fileId && candidate.fileId === media.fileId),
    )
    if (existingIndex >= 0) {
      return {
        media: mediaBuffers[existingIndex] as MediaBuffer,
        mediaId: existingIndex + 1,
      }
    }

    mediaBuffers.push(media)
    return { media, mediaId: mediaBuffers.length }
  })
}

export function queueModelInspectionImages(
  registeredMedia: RegisteredToolMedia[],
): Set<number> {
  const context = requireToolContext()
  const limitReachedMediaIds = new Set<number>()
  for (const item of registeredMedia) {
    if (item.media.mediaType !== 'image') continue
    if (item.media.origin !== 'history') continue
    if (context.inspectedModelMediaIds.has(item.mediaId)) continue
    if (context.inspectedModelMediaIds.size >= MAX_MODEL_INSPECTION_IMAGES) {
      limitReachedMediaIds.add(item.mediaId)
      continue
    }

    context.inspectedModelMediaIds.add(item.mediaId)
    context.pendingModelInspectionImages.push(item)
  }
  return limitReachedMediaIds
}

export function takePendingModelInspectionImages(): RegisteredToolMedia[] {
  return requireToolContext().pendingModelInspectionImages.splice(0)
}

export function setToolHistoryMessages(messages: Message[]): void {
  requireToolContext().historyMessages = messages
}

export function claimGeneratedMedia(): void {
  const context = requireToolContext()
  if (context.generatedMediaClaimed) {
    throw new Error(
      'Only one generated media result can be created per request',
    )
  }

  context.generatedMediaClaimed = true
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
  api?: ChatAdminApi & Partial<MediaResolverApi>,
  commandName?: string,
): Promise<T> {
  return contextStorage.run(
    {
      message,
      api,
      commandName,
      generatedMediaClaimed: false,
      historyMessages: [],
      mediaBuffers,
      pendingModelInspectionImages: [],
      inspectedModelMediaIds: new Set<number>(),
      responses: [],
    },
    callback,
  )
}
