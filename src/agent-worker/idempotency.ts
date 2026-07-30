import {
  acquireWorkerLease,
  getWorkerIdempotencyKey,
  WORKER_LEASE_HEARTBEAT_INTERVAL_MS,
  type WorkerLease,
} from '@tg-bot/common'

const AGENT_WORKER_NAMESPACE = 'agent-worker'

export const AGENT_WORKER_HEARTBEAT_INTERVAL_MS =
  WORKER_LEASE_HEARTBEAT_INTERVAL_MS

export type AgentWorkerLease = WorkerLease

export function getAgentWorkerIdempotencyKey(
  chatId: string | number,
  messageId: number,
): string {
  return getWorkerIdempotencyKey(AGENT_WORKER_NAMESPACE, chatId, messageId)
}

export async function acquireAgentWorkerLease(
  chatId: string | number,
  messageId: number,
  ownerToken: string,
): Promise<AgentWorkerLease | null> {
  return acquireWorkerLease(
    AGENT_WORKER_NAMESPACE,
    chatId,
    messageId,
    ownerToken,
  )
}
