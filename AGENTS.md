# AGENTS.md

## Command Convention
- Use only project scripts from `package.json`.
- `bun run biome` for lint checks.
- `bun run tsc` for type checks.
- `bun test` for unit tests.
- `bun run build` for packaging.
- `bun run start` for local serverless run.

## Engineering Principle
- Always follow KISS.
- Before adding code, try to remove code.
- Prefer the smallest change that solves the issue.
- Avoid duplicate logic between lambdas.

## Telegram Worker Ownership and Dispatch
- `src/telegram-bot/index.ts` is the webhook ingress. It must return fast and
  never wait for worker completion or model processing.
- Ingress enqueues every message in the activity FIFO queue.
  `src/telegram-bot/activity-worker.ts` owns statistics, chat event writes, AI
  chat history persistence and WebSocket stats broadcast fanout.
- `src/telegram-bot/telegram-reply-worker.ts` owns registered non-agent command
  execution.
- `src/agent-worker/` owns dynamic commands, reply gating, AI generation and
  tool execution.
- `AGENT_COMMANDS` in `src/telegram-bot/agent/index.ts` is the source of truth
  for registered agent commands. They go to the agent worker with the command
  stripped and the reply gate bypassed; do not duplicate the command list here.
- Other registered commands go to the reply worker. Non-command messages and
  unregistered slash commands go to the agent worker, where a matching dynamic
  command is resolved before reply gating.
- Commands addressed to another bot are ignored for reply and agent dispatch.
- Use the Telegram chat id as `MessageGroupId` so one chat stays ordered while
  different chats run in parallel.

## Telegram Agentic Flow
- Before agent enqueue, ingress performs only the short-cached DynamoDB chat
  enabled check. It fails closed so disabled chats consume neither SQS messages
  nor agent-worker concurrency.
- Agent worker flow:
  1. repeat the chat enabled check for stale/direct/retried deliveries
  2. acquire the idempotency lease
  3. run a matching dynamic command, bypass the reply gate for a registered
     agent command, or run the reply gate for an ordinary candidate (GPT-5.6
     Luna; Gemini 3.5 Flash-Lite fallback)
  4. run main response generation and tools when needed (GPT-5.6 Luna; Gemini
     3.6 Flash fallback)

## Reliability Rules
- Webhook/incoming lambda must finish under 10 seconds.
- Never block ingress on LLM calls.
- Keep the ingress configuration cache short and the check bounded. Cache
  misses use strongly consistent reads. DynamoDB failure must skip agent
  enqueue rather than fail open and must remain observable through an alarmed
  error log.
- Ingress waits only for the bounded configuration check and SQS `SendMessage`
  ACKs, never for worker completion.
- SQS worker event mappings use `batchSize: 1` and partial batch responses.
- Keep worker idempotency: SQS delivery is at least once.
