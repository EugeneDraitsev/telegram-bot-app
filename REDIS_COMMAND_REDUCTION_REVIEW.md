# Redis command reduction — review brief

## Review goal

Please review this change set for correctness, retry safety, AWS IAM/CloudFormation wiring, and whether the expected Upstash command reduction is real. The production symptom was roughly 252K of the 500K monthly free-tier commands by August 13, with `GET`, `SET`, `EVAL`, `ZADD`, and `EXPIRE` dominating.

This brief describes commit R on `codex/redis-command-reduction`. The stacked
DynamoDB branch intentionally changes chat configuration in later commits.
Neither local branch has been pushed or deployed.

## What changed

### 1. Worker idempotency no longer uses Lua heartbeats

Files:

- `src/common/upstash/worker-idempotency.ts`
- `src/agent-worker/index.ts`
- `src/agent-worker/idempotency.ts`
- `resources.yml`
- `serverless.yml`

Before:

- processing lease: 45 seconds;
- heartbeat every 15 seconds;
- each heartbeat used `EVAL`, whose script executed `GET` and `EXPIRE`;
- completion used `EVAL`, whose script executed `GET` and `SET`.

After:

- processing lease: 360 seconds;
- no heartbeat;
- acquire: one `SET key owner NX EX 360`;
- complete: one native `SET key completed XX GET EX 10800` and verify that the returned previous value is the owner token;
- release after failure: one native `GETDEL` and verify the returned owner token.

Safety invariant: both Redis-backed Lambda workers have a 300-second timeout, while their FIFO SQS queues have a 1,800-second visibility timeout. A live invocation therefore cannot outlast the 360-second ownership lease. If either Lambda timeout is ever increased, the lease must be increased first.

Please scrutinize the use of `SET ... GET XX` and `GETDEL`, especially serialization of the owner token in `@upstash/redis` and the assumption that no valid second owner can exist before the first invocation is forcibly terminated.

### 2. Chat-history retention is amortized across writes

File: `src/common/upstash/chat-history.ts`

Before each incoming or bot message:

1. `ZADD NX`
2. `ZREMRANGEBYSCORE`
3. `EXPIRE`

After, on a warm instance:

1. every write uses `ZADD NX`;
2. `ZREMRANGEBYSCORE` and `EXPIRE` run at most once per hour per chat and Lambda instance.

`ZADD` finishes before maintenance starts. This also fixes the old new-key race where a concurrent `EXPIRE` HTTP request could arrive before `ZADD` had created the sorted set. The physical TTL is 25 hours, while every `ZRANGE` keeps an exact 24-hour score lower bound. The extra hour means a final message written just before maintenance becomes due cannot disappear before its visible 24-hour window ends.

Tradeoff: physical members and an idle key can remain for up to roughly one extra hour. Cold/concurrent Lambda instances can each perform the same idempotent maintenance, but high-volume warm paths pay only the `ZADD`.

### 3. Metrics keep exact events with hourly retention maintenance

File: `src/common/upstash/metrics.ts`

Before every model/tool metric:

1. `ZADD`
2. `ZREMRANGEBYSCORE`

After: every event still gets one exact `ZADD`, while `ZREMRANGEBYSCORE` runs at most once per hour per warm Lambda instance. A report also requests the same guarded maintenance if it is due. The time query itself remains exact, and cleanup failure is logged without hiding an otherwise valid metric write or report.

Tradeoff: separate cold Lambda instances can each trim once, and physical deletion can lag by approximately the maintenance interval. Retention no longer depends on somebody opening `/x`.

### 4. Slow-changing Redis reads use a warm-Lambda TTL cache

Files:

- `src/common/ttl-cache.ts`
- `src/common/upstash/memory.ts`
- `src/common/upstash/dynamic-tools.ts`

Chat memory, global memory, and global/chat dynamic-tool payloads are cached per Lambda instance for 60 seconds. Empty values are cached too. Successful writes refresh the local cache immediately; other warm instances can be stale for at most 60 seconds.

The cache has no timers and therefore does not keep a Lambda alive. It is only an optimization; Redis remains the source of truth. Capacity is not explicitly bounded; entries expire when accessed again or when the warm Lambda instance is recycled.

### 5. Unit tests cannot reach the configured Upstash database

File: `src/common/upstash/client.ts`

Bun may automatically load the developer's real `.env` during `bun test`. The shared Redis client now fails closed when `NODE_ENV=test`, while focused Redis unit tests continue to inject their own mock clients. This prevents test runs from silently consuming production Upstash commands and makes the suite independent of network availability.

## Estimated Redis command budget

Approximate normal message, reply gate says “do not answer”, worker under 300 seconds:

| Path | Before | After, warm cache |
| --- | ---: | ---: |
| incoming history | 3 | 1 |
| enabled configuration | 1 Redis `GET` | 1 Redis `GET` |
| worker idempotency | 4 minimum | 2 |
| chat/global memory | 2 `GET` | 0 on cache hit |
| reply-gate metric | 2 | 1 |
| total | about 12 | about 5 |

A simple reply without tools drops from roughly 20 commands to roughly 8 on warm caches. Cold memory/tool caches can add up to four `GET`s. The first history/metrics operation in an hourly maintenance window adds cleanup/expiry commands. Each tool metric otherwise drops from two commands to one. Long-running jobs no longer add three commands every 15 seconds.

These are code-path estimates, not production measurements. Validate with Upstash “Top Commands Usage” for a full 24-hour period after deployment. `EVAL` should disappear from application traffic; `GET`, `EXPIRE`, and retention-trim traffic should fall materially. `ZADD` remains once per exact history or metric event by design.

## Specific review checklist

1. Confirm the 360s lease is strictly greater than every Lambda path that can hold it.
2. Confirm the 1,800s SQS visibility timeout remains greater than the 300s Lambda timeout.
3. Check native Redis command behavior and return types for `SET GET XX` and `GETDEL` in `@upstash/redis@1.38.x`.
4. Check that no code path can call `release()` after ownership could legitimately transfer.
5. Check the 60-second cross-instance staleness tradeoff after memory and dynamic-tool updates.
6. Check that history reads keep an exact 24-hour window, metric cleanup failures stay non-fatal, and failed history maintenance is safe to retry through SQS/idempotent `ZADD NX`.
7. Confirm `OPENAI_CHAT_IDS` and Redis-backed `/toggle` behavior are unchanged in commit R.
8. Look for any remaining Lua `EVAL` calls or heartbeat timers.
9. Confirm the `NODE_ENV=test` Upstash guard cannot affect deployed Lambdas and that Redis unit tests use injected clients.

## Verification commands

Project policy requires these scripts:

```sh
bun run biome
bun run tsc
bun test
bun run build
```

Also inspect:

```sh
git diff --check
git status --short
```

No commit, push, migration, or deployment should be performed as part of this review.
