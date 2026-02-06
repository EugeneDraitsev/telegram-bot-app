/**
 * Tool Context Management
 *
 * Stores context for tool execution including:
 * - Message being processed
 * - Attached images
 * - Response collector for gathering tool outputs
 */

import type { Message } from 'telegram-typings'

import {
  type AgentResponse,
  createResponseCollector,
  type ResponseCollector,
} from '../types'

export interface ToolContext {
  message: Message
  imagesData?: Buffer[]
  collector: ResponseCollector
}

let currentContext: ToolContext | null = null

/**
 * Set the current tool context
 */
export function setToolContext(
  message: Message,
  imagesData?: Buffer[],
): ResponseCollector {
  const collector = createResponseCollector()
  currentContext = { message, imagesData, collector }
  return collector
}

/**
 * Get the current tool context (may be null)
 */
export function getToolContext(): ToolContext | null {
  return currentContext
}

/**
 * Get the current tool context (throws if not set)
 */
export function requireToolContext(): ToolContext {
  if (!currentContext) {
    throw new Error('Tool context not set')
  }
  return currentContext
}

/**
 * Add a response to the collector
 */
export function addResponse(response: AgentResponse): void {
  if (!currentContext) {
    throw new Error('Tool context not set')
  }
  currentContext.collector.add(response)
}

/**
 * Clear the current tool context
 */
export function clearToolContext(): void {
  currentContext = null
}

/**
 * Get all collected responses
 */
export function getCollectedResponses(): AgentResponse[] {
  return currentContext?.collector.getAll() || []
}
