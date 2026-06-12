# AWS serverless telegram bot

[![serverless](https://img.shields.io/badge/serveless-v4-blue)](http://www.serverless.com)
[![Deploy Latest Main](https://github.com/EugeneDraitsev/telegram-bot-app/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/EugeneDraitsev/telegram-bot-app/actions/workflows/deploy.yml)
[![CodeQL status](https://github.com/EugeneDraitsev/telegram-bot-app/actions/workflows/codeql.yml/badge.svg?branch=main&event=push)](https://github.com/EugeneDraitsev/telegram-bot-app/actions/workflows/codeql.yml)

Serverless Telegram bot based on [grammY](https://github.com/grammyjs/grammY)
and [Serverless Framework](https://github.com/serverless/serverless).

![demo](.github/cat.jpg)

## Architecture

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "fontFamily": "Segoe UI, Helvetica, Arial, sans-serif",
    "fontSize": "16px",
    "lineColor": "#7d8ba1",
    "textColor": "#e8edf5",
    "nodeTextColor": "#e8edf5",
    "primaryTextColor": "#e8edf5",
    "titleColor": "#7d8ba1",
    "edgeLabelBackground": "#2f3a4d",
    "clusterBkg": "transparent",
    "clusterBorder": "#7d8ba1"
  },
  "flowchart": { "curve": "basis", "nodeSpacing": 35, "rankSpacing": 60 }
} }%%
flowchart TB
  CRON1["⏰ currency-scheduler<br/>Mon–Fri 9:00 / 17:00"]:::cron
  CRON2["⏰ redis-scheduler<br/>hourly cleanup"]:::cron
  TG(["✈️ Telegram"]):::tg
  BOT["🤖 telegram-bot<br/>webhook ingress"]:::ingress

  subgraph WORKERS["async workers"]
    direction LR
    ACT["📊 activity-worker<br/>stats · events · AI history"]:::worker
    REPLY["💬 reply-worker<br/>registered commands"]:::worker
    AGENT["🧠 agent-worker<br/>reply gate · agentic loop"]:::ai
  end

  EVENTS[("🗄️ chat-events")]:::db
  STATS[("🗄️ chat-statistics")]:::db
  REDIS[("⚡ Upstash Redis<br/>AI chat history")]:::redis
  APIS["☁️ Google · YouTube · Weather<br/>Tavily · Gemini · OpenAI"]:::ext

  BCAST["📡 broadcast-stats"]:::worker
  WSL["🔌 websockets<br/>connect · stats · disconnect"]:::worker
  SEARCH["🔍 chat-search"]:::worker
  IMG["🖼️ sharp-statistics<br/>PNG charts"]:::worker

  CONNS[("🗄️ websocket-connections")]:::db
  WSS{{"🔌 WebSocket API"}}:::gw
  HTTP{{"🌐 REST API<br/>/search · /statistics"}}:::gw

  UI(["🖥️ telegram-bot-ui"]):::ui

  CRON1 -->|"currency digest"| TG
  TG <==>|"webhook"| BOT
  BOT -.->|"every message"| ACT
  BOT -.->|"registered cmds"| REPLY
  BOT -.->|"/q · /qq · fallback"| AGENT

  REPLY -->|"reply"| TG
  AGENT -->|"reply"| TG
  REPLY <--> APIS
  AGENT <--> APIS
  AGENT <-->|"chat history"| REDIS
  CRON2 -->|"cleanup"| REDIS

  ACT --> STATS & EVENTS
  ACT -->|"AI history"| REDIS
  ACT -.->|"stats fanout"| BCAST

  STATS --> BCAST & WSL & SEARCH
  EVENTS --> BCAST & WSL & IMG

  BCAST -->|"connections"| CONNS
  WSL --> CONNS
  BCAST -.->|"push live stats"| WSS
  WSL <--> WSS
  SEARCH --> HTTP
  IMG --> HTTP

  WSS <-->|"live stats"| UI
  HTTP <-->|"search · charts"| UI

  classDef tg fill:#229ED9,stroke:#16648c,color:#ffffff,font-weight:bold
  classDef ingress fill:#f59e0b,stroke:#92400e,color:#451a03,font-weight:bold
  classDef worker fill:#ea580c,stroke:#7c2d12,color:#ffffff,font-weight:bold
  classDef ai fill:#7c3aed,stroke:#4c1d95,color:#ffffff,font-weight:bold
  classDef ext fill:#059669,stroke:#064e3b,color:#ffffff,font-weight:bold
  classDef db fill:#4f46e5,stroke:#312e81,color:#ffffff,font-weight:bold
  classDef redis fill:#dc2626,stroke:#7f1d1d,color:#ffffff,font-weight:bold
  classDef cron fill:#64748b,stroke:#334155,color:#ffffff,font-weight:bold
  classDef gw fill:#db2777,stroke:#831843,color:#ffffff,font-weight:bold
  classDef ui fill:#0f172a,stroke:#38bdf8,color:#7dd3fc,font-weight:bold
  style WORKERS fill:transparent,stroke:#7d8ba1,stroke-width:1px,stroke-dasharray:6 6
```

<details>
<summary>Legacy architecture</summary>

![architecture](.github/architecture.png)

</details>

## How It Works

`src/telegram-bot` is the Telegram ingress layer. It handles the webhook,
records no statistics directly and returns quickly. It only dispatches async
Lambda `Event` invokes:

- every message payload goes to `telegram-activity-worker` for statistics,
  chat events, live stats broadcast and AI chat history persistence;
- `/q` and `/qq` go directly to `telegram-agent-worker` with the reply gate
  bypassed;
- other registered commands go to `telegram-reply-worker`;
- non-command messages fall through to `telegram-agent-worker`;
- unregistered slash commands are allowed to reach the agent flow for dynamic
  commands;
- commands addressed to another bot are ignored.

Registered commands are detected from Telegram `bot_command` entities at offset
0. Command names are normalized before worker dispatch so uppercase commands
and caption commands still match the same worker-side grammY handlers.

`src/telegram-bot/telegram-reply-worker` owns registered non-agent commands:
text helpers, search/translate/weather/currency/user/stat commands, and direct
image or multimodal commands.

`src/agent-worker` owns the agentic flow: chat-enabled checks, reply gating,
main response generation and tool execution. This keeps AI decisions out of the
webhook lambda.

`src/telegram-bot/activity-worker` owns the non-reply side effects that used to
run in ingress: statistics updates, chat event writes, AI chat history writes
and WebSocket stats broadcast fanout. The webhook waits only for the async invoke
ACK, not for these tasks to complete.

`src/websockets` owns only the WebSocket runtime for the stats UI: connection
tracking, initial `stats` responses and live broadcast fanout when new chat
events are written. `saveEvent` lives in `src/common`; any lambda that writes a
chat event through it can trigger the broadcast lambda.

`src/chat-search` owns the REST `/search` endpoint used by
`telegram-bot-ui` to discover chats. It reads `chat-statistics`; it is separate
from WebSockets because it is ordinary request/response HTTP.

`src/sharp-statistics` renders the PNG statistics image from stored chat events.

`src/telegram-bot/currency-scheduler` and `src/telegram-bot/redis-scheduler`
are cron lambdas: the first posts a currency digest to selected chats on
weekday mornings and evenings, the second hourly clears old AI chat history
in Redis.

`src/common` contains shared runtime code: Telegram helpers, DynamoDB access,
Lambda invocation, S3 helpers, Upstash Redis access, logging, formatting and
shared types.

## Related Projects

- [telegram-bot-ui](https://github.com/EugeneDraitsev/telegram-bot-ui)
- Legacy: [telegram-bot-websockets](https://github.com/EugeneDraitsev/telegram-bot-websockets)
