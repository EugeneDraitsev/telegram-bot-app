import { AsyncLocalStorage } from 'node:async_hooks'
import type { Message } from 'grammy/types'

import {
  type ChatAdminApi,
  type MediaBuffer,
  type MetricSource,
  type MetricStatus,
  timedCall,
} from '@tg-bot/common'
import type { AgentResponse } from '../types'

interface ToolContext {
  message: Message
  api?: ChatAdminApi
  commandName?: string
  generatedMediaClaimed: boolean
  mediaBuffers?: MediaBuffer[]
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
  api?: ChatAdminApi,
  commandName?: string,
): Promise<T> {
  return contextStorage.run(
    {
      message,
      api,
      commandName,
      generatedMediaClaimed: false,
      mediaBuffers,
      responses: [],
    },
    callback,
  )
}
