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
- Ingress lambda only forwards message payload to `telegram-agent-worker` asynchronously.
- `src/agent-worker/` owns all AI decisions.
- Agent worker flow:
  1. chat enabled check
  2. quick filter (cheap model)
  3. main response generation (Gemini flash model)

## Reliability Rules
- Webhook/incoming lambda must finish under 10 seconds.
- Never block ingress on LLM calls.
- Never block ingress on completion of `invokeAgentLambda`.
