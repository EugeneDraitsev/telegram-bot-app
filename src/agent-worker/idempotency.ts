import { acquireWorkerLease, type WorkerLease } from '@tg-bot/common'

const AGENT_WORKER_NAMESPACE = 'agent-worker'

export const LOCAL_TEST_MESSAGE_ID = 900001

const LOCAL_TEST_LEASE: WorkerLease = {
  async complete() {
    return true
  },
  async release() {
    return true
  },
}

export type AgentWorkerLease = WorkerLease

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
