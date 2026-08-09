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

## Telegram Agentic Flow
- `src/telegram-bot/` is ingress only.
- Ingress lambda must return fast and never wait for agent processing.
- Ingress only enqueues message payloads in the reply, agent and activity FIFO SQS queues.
- Use the Telegram chat id as `MessageGroupId` so one chat stays ordered while different chats run in parallel.
- `src/agent-worker/` owns all AI decisions.
- Agent worker flow:
  1. chat enabled check
  2. single reply gate check (GPT-5.6 Luna; Gemini 3.5 Flash-Lite fallback)
  3. main response generation (GPT-5.6 Luna; Gemini 3.6 Flash fallback)

## Reliability Rules
- Webhook/incoming lambda must finish under 10 seconds.
- Never block ingress on LLM calls.
- Ingress waits only for the SQS `SendMessage` ACK, never for worker completion.
- SQS worker event mappings use `batchSize: 1` and partial batch responses.
- Keep worker idempotency: SQS delivery is at least once.
