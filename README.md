# AWS serverless Telegram bot

[![serverless](https://img.shields.io/badge/serveless-v4-blue)](http://www.serverless.com)
[![Deploy Latest Main](https://github.com/EugeneDraitsev/telegram-bot-app/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/EugeneDraitsev/telegram-bot-app/actions/workflows/deploy.yml)
[![CodeQL status](https://github.com/EugeneDraitsev/telegram-bot-app/actions/workflows/codeql.yml/badge.svg?branch=main&event=push)](https://github.com/EugeneDraitsev/telegram-bot-app/actions/workflows/codeql.yml)

Serverless Telegram bot built with [grammY](https://github.com/grammyjs/grammY)
and [Serverless Framework](https://github.com/serverless/serverless).

![demo](.github/cat.jpg)

## Architecture

Everything at a glance:

<a href=".github/architecture-overview-light.svg">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/architecture-overview-dark.svg">
    <img alt="Architecture overview" src=".github/architecture-overview-light.svg">
  </picture>
</a>

### Message path

How one Telegram update becomes a reply:

<a href=".github/architecture-message-path-light.svg">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/architecture-message-path-dark.svg">
    <img alt="Message path diagram" src=".github/architecture-message-path-light.svg">
  </picture>
</a>

### Statistics and live UI

What the activity worker writes and how the stats page stays live:

<a href=".github/architecture-stats-ui-light.svg">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/architecture-stats-ui-dark.svg">
    <img alt="Statistics and live UI diagram" src=".github/architecture-stats-ui-light.svg">
  </picture>
</a>

Diagram sources are in [`.github/diagram`](.github/diagram). Run
`bun run diagram` after changing them.

## Runtime

The webhook in `src/telegram-bot` returns quickly after dispatching FIFO SQS
jobs. A Telegram chat id is the message group id, so each chat stays ordered
while different chats run in parallel.

- `activity-worker` records statistics, chat events, AI history, and live UI
  updates.
- `telegram-reply-worker` handles registered non-agent commands.
- `agent-worker` handles commands from `AGENT_COMMANDS`, dynamic commands,
  reply gating, model calls, and tools.
- `websockets` serves authenticated live statistics.
- `sharp-renderer` renders PNG cards and charts.
- `currency-scheduler` posts scheduled currency digests.
- `admin-api` verifies Telegram OIDC logins and exposes owner-only chat
  configuration reads and writes.

DynamoDB chat configuration controls AI access. Ingress checks it before
enqueueing agent work, and the agent worker checks it again before processing.
Redis leases prevent duplicate Telegram replies when SQS redelivers a message;
activity writes are independently replay-safe. Worker queues use one-message
batches, partial batch responses, and separate dead-letter queues.

## Agent media

The agent supports image generation plus these Google media models:

- `/omni` — `veo-3.1-lite-generate-preview`, 6-second 720p video with native audio;
- `/lyria` — `lyria-3-clip-preview`, a 30-second music clip;
- `/lyriapro` — `lyria-3-pro-preview`, a full-length structured song.

The same features are available to natural-language requests through
`generate_video_with_veo` and `generate_music_with_lyria`.

Current, replied, album, and recent-history media is described to the routing
model as structured `MESSAGE_CONTEXT` and `MEDIA` blocks. Every item has a
stable `media_id`, its source message, author, text, and relation. Generation
tools default to current/replied/album media; the model must select exact ids
when the user refers to particular history items. An empty id list means
text-only generation.

Veo 3.1 Lite accepts one starting image up to 14 MiB and generates 4-, 6-, or
8-second video; the bot defaults to 6 seconds. Lyria accepts up to ten images
within the same budget. Explicit invalid selections fail; implicit selections
keep the newest supported items that fit. Only one generated media result is
created per agent request.

Generated video is sent through Telegram's video player with a document
fallback. Lyria Clip uses a voice message; Lyria Pro uses the music player with
its title. Audio delivery falls back to audio and then document. Captions,
titles, and requested lyrics are delivered separately from the binary payload
when needed.

Google calls use the Vercel AI SDK and `GEMINI_API_KEY`
(`GOOGLE_GENERATIVE_AI_API_KEY` also works). Veo uses the SDK's native video
model support; Lyria audio is extracted from the raw Interactions response. The
project does not require Vertex AI or `@google/genai`.

## Local development

Docker must be running. Start Serverless Offline and its ElasticMQ container:

```sh
bun run start
```

During `serverless-offline`, the read-only chat authorization gates are open,
FIFO deduplication ids include a nonce, and Redis worker leases are bypassed.
This lets the same Telegram `message_id` run repeatedly without reading the
production chat-configuration table. The framework alone sets `IS_OFFLINE`;
deployed Lambdas never receive it. Configuration writes are not emulated.

## Owner admin API

The admin dashboard uses Telegram's authorization-code OIDC flow. The UI
exchanges the one-time code server-side, then this service verifies the signed
Telegram ID token and requires its user id to equal `BOT_OWNER_ID`. Successful
logins receive a separate 12-hour admin session; AWS credentials are never sent
to the UI.

Configure these deployment values:

- repository variable `TELEGRAM_OIDC_CLIENT_ID` from BotFather;
- repository secret `ADMIN_SESSION_SECRET` with at least 32 random characters;
- the existing repository variable `BOT_OWNER_ID` with the sole allowed
  Telegram user id.

The Lambda role can only scan the chat configuration/statistics tables and
read or update the configuration table. It has no Redis, queue, model, or bot
token access.

Stop with `Ctrl+C` so Serverless can remove ElasticMQ cleanly.

## Checks

```sh
bun run biome
bun run tsc
bun test
bun run build
```

## Related projects

- [telegram-bot-ui](https://github.com/EugeneDraitsev/telegram-bot-ui)
- Legacy: [telegram-bot-websockets](https://github.com/EugeneDraitsev/telegram-bot-websockets)
