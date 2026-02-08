import { AsyncLocalStorage } from 'node:async_hooks'
import type { Message } from 'telegram-typings'

import type { AgentResponse } from '../types'

interface ToolContext {
  message: Message
  imagesData?: Buffer[]
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

export async function runWithToolContext<T>(
  message: Message,
  imagesData: Buffer[] | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  return contextStorage.run({ message, imagesData, responses: [] }, callback)
}
