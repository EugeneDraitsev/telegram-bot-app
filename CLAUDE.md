# CLAUDE.md

## Command Convention
- Use only project scripts from `package.json`.
- `bun run biome` for lint checks.
- `bun run tsc` for type checks.
- `bun test` for unit tests.
- `bun run build` for packaging.
- `bun run start` for local serverless run.

## Engineering Principle
- KISS first.
- If one line can be removed safely, remove it.
- Keep behavior explicit and easy to reason about.
- Do not add abstractions without a clear need.

## Telegram Bot Architecture
- `telegram-bot` lambda is ingress/webhook.
- `agent-worker` lambda is AI executor.
- Ingress should not run LLM logic.
- Ingress should dispatch to worker asynchronously and return.
- Worker performs:
  1. quick filter with cheap model
  2. agentic loop with main model

## Performance/Safety
- Do not allow webhook path to wait on model latency.
- Keep ingress path deterministic and short.
- Keep AI gating and long-running work in worker only.
