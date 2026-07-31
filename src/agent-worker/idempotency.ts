import {
  acquireWorkerLease,
  getWorkerIdempotencyKey,
  WORKER_LEASE_HEARTBEAT_INTERVAL_MS,
  type WorkerLease,
} from '@tg-bot/common'

const AGENT_WORKER_NAMESPACE = 'agent-worker'

export const LOCAL_TEST_MESSAGE_ID = 900001

const LOCAL_TEST_LEASE: WorkerLease = {
  async renew() {
    return true
  },
  async complete() {
    return true
  },
  async release() {
    return true
  },
}

export const AGENT_WORKER_HEARTBEAT_INTERVAL_MS =
  WORKER_LEASE_HEARTBEAT_INTERVAL_MS

export type AgentWorkerLease = WorkerLease

export function getAgentWorkerIdempotencyKey(
  chatId: string | number,
  messageId: number,
): string {
  return getWorkerIdempotencyKey(AGENT_WORKER_NAMESPACE, chatId, messageId)
}

export function isLocalAgentWorkerTestMessage(messageId: number): boolean {
  return (
    process.env.IS_OFFLINE === 'true' && messageId === LOCAL_TEST_MESSAGE_ID
  )
}

export async function acquireAgentWorkerLease(
  chatId: string | number,
  messageId: number,
  ownerToken: string,
): Promise<AgentWorkerLease | null> {
  if (isLocalAgentWorkerTestMessage(messageId)) {
    return LOCAL_TEST_LEASE
  }

  return acquireWorkerLease(
    AGENT_WORKER_NAMESPACE,
    chatId,
    messageId,
    ownerToken,
  )
}
