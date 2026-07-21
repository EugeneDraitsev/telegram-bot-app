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
- `telegram-activity-worker` lambda owns statistics, chat events, AI chat
  history persistence and stats broadcast fanout.
- `telegram-reply-worker` lambda owns registered non-agent command execution.
- `agent-worker` lambda is AI executor.
- Ingress should not run LLM logic.
- Ingress should not update statistics, save chat events or save AI chat
  history inline.
- Ingress should dispatch to workers asynchronously and return.
- Agent worker performs:
  1. single reply gate check with Gemini 3.5 Flash-Lite
  2. agentic loop with Gemini 3.6 Flash
- Registered command dispatch:
  - `/q` and `/qq` go to `agent-worker` with reply gate bypassed.
  - other registered commands go to `telegram-reply-worker`.
  - unknown slash commands are allowed to reach the agent flow for dynamic
    commands.
  - commands addressed to another bot are ignored.

## Performance/Safety
- Do not allow webhook path to wait on model latency.
- Keep ingress path deterministic and short.
- Keep AI gating, command execution, statistics and history writes in workers
  only.
