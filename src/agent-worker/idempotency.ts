import { acquireWorkerLease, type WorkerLease } from '@tg-bot/common'

const AGENT_WORKER_NAMESPACE = 'agent-worker'

export type AgentWorkerLease = WorkerLease

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
