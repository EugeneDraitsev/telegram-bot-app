# DynamoDB chat configuration rollout plan

Status: implemented as local stacked commits for review. Nothing in this
document authorizes a push, AWS mutation, migration, or deployment.

## Decision

Use an expand -> migrate -> cutover -> cleanup rollout.

The first deploy adds only the permanent DynamoDB table while the currently
deployed application continues to read `OPENAI_CHAT_IDS` and Redis. After the
legacy state has been copied and verified, a second deploy switches the runtime
to DynamoDB.

A Git commit alone does not create an AWS table. The infrastructure-only commit
must be deployed before migration. Until that deployment succeeds, the old
runtime remains the only source of truth.

The local branch layout keeps the independently deployable boundaries intact:

- `codex/redis-command-reduction`: Redis-only commit R;
- `codex/dynamo-chat-configuration`: commit A followed by runtime commit B.

## Identity and authorization

- `BOT_OWNER_ID` is the numeric Telegram user id supplied out of band.
- Do not hardcode it in source code, CloudFormation, examples, or committed
  migration output. Configure it as a GitHub Actions repository variable and a
  local environment variable when running the migration.
- Only this owner can run `/allowai` and `/disallowai`.
- `/toggle` keeps the existing Telegram creator/administrator authorization.
- Effective agentic access is:

  ```text
  AGENTIC_BOT_ENABLED && aiAllowed && agenticEnabled
  ```

## Permanent table contract

```text
Table: chat-configuration
Partition key: chatId (String)
Sort key: none
TTL: none
Billing: PAY_PER_REQUEST

aiAllowed: boolean       # bot-owner gate
agenticEnabled: boolean  # chat-admin /toggle gate
version: number          # optimistic concurrency
allowUpdatedAt / allowUpdatedBy
toggledAt / toggledBy
```

The CloudFormation resource should include:

- `DeletionProtectionEnabled: true`;
- `DeletionPolicy: Retain`;
- `UpdateReplacePolicy: Retain`;
- point-in-time recovery enabled;
- tags identifying permanent configuration data.

The application stack should own the table from its creation. The migration
tool must not call `CreateTable`; it should fail clearly when the expected table
does not exist or has an incompatible key schema. This avoids an unmanaged
resource and a later CloudFormation name collision.

## Phase 0 - local branch split, no external changes

Because Upstash command usage is already urgent, the Redis-only reductions are
an independent commit R and can deploy before phase 1. Commit R may contain
idempotency, history/metrics maintenance, memory/tool TTL caches,
and the `NODE_ENV=test` safety guard, but it must leave `OPENAI_CHAT_IDS`, the
Redis agentic-chat key, and `/toggle` behavior unchanged. Never mix commit R
with either the table expansion or the DynamoDB runtime cutover; each change
must be independently reviewable and revertible.

Commit A may contain only:

- the `AWS::DynamoDB::Table` resource and table-name wiring;
- the migration tool and its unit tests;
- the package script and rollout documentation needed to run it.

Commit A must not contain:

- DynamoDB runtime reads or writes;
- `/allowai` or `/disallowai`;
- changes to `/toggle`;
- new Lambda DynamoDB IAM permissions;
- removal of `OPENAI_CHAT_IDS` from Lambda environments;
- removal of the Redis agentic-chat implementation;
- unrelated Redis command-reduction changes.

Required checks for every commit boundary:

```sh
bun run biome
bun run tsc
bun test
bun run build
git diff --check
```

## Phase 1 - infrastructure-only expansion

1. Review commit A.
2. Deploy commit A through the normal Serverless/CloudFormation path.
3. Confirm the stack owns `chat-configuration` in `eu-central-1`.
4. Confirm the table is `ACTIVE`, on-demand, deletion-protected, retained, has
   PITR enabled, has only the `chatId` partition key, and has no TTL.
5. Confirm all Lambdas are still running the old env + Redis configuration
   behavior.

No records are migrated in this phase.

## Phase 2 - snapshot, migrate, and verify

Set the supplied numeric `BOT_OWNER_ID` only in the operator environment. Do
not commit its value.

The AWS principal running the migration needs only:

- `lambda:GetFunctionConfiguration` on the deployed legacy Lambda used as the
  source;
- `dynamodb:DescribeTable` and `dynamodb:DescribeContinuousBackups` on the chat
  configuration table;
- `dynamodb:Scan`, `dynamodb:PutItem`, and `dynamodb:GetItem` on that table.

It does not need table creation, deletion, CloudFormation, or application
deployment permissions. If the Lambda environment uses a customer-managed KMS
key, the operator may also need `kms:Decrypt` for that key.

1. Run the migration in dry-run mode.
2. Read `OPENAI_CHAT_IDS` and Upstash credentials from the currently deployed
   legacy Lambda configuration without printing secrets.
3. Read Redis key `bot-config:agentic-chats`.
4. Build the new rows using exact legacy semantics:

   ```text
   aiAllowed       = chat id exists in OPENAI_CHAT_IDS
   agenticEnabled  = chat id exists in OPENAI_CHAT_IDS AND in Redis
   ```

   A Redis-only id was ineffective before migration and must remain disabled.

5. Save a local, uncommitted migration report containing counts and chat ids so
   the result can be compared manually. Never include Redis credentials or bot
   tokens.
6. Run apply mode only after the dry-run counts are approved.
7. Read every written item back with strongly consistent reads and compare both
   flags.
8. Treat any protected-row skip as a failed migration. The report is still
   written for diagnosis, but the command must exit nonzero and runtime cutover
   must not proceed until every skipped row is understood and resolved.
9. Do not delete or mutate `OPENAI_CHAT_IDS` or the Redis key. They are required
   for rollback.

Migration writes must be idempotent. Migration-owned rows may be updated by a
rerun; rows subsequently changed by an owner/admin command must not be
overwritten by stale migration data.

## Phase 3 - final sync and runtime cutover

There is a race if `/toggle` changes Redis after the snapshot but before the
new runtime starts. Use a short configuration freeze:

1. Tell chat admins not to run `/toggle` during the cutover window.
2. Immediately rerun migration apply and verification.
3. Deploy commit B directly after the successful final sync.
4. End the freeze after smoke tests pass.

For a system where a freeze is impossible, use a temporary dual-write bridge
instead: old reads remain authoritative while `/toggle` writes both Redis and
DynamoDB, then backfill and switch reads. That is more code and is not needed
for this small, admin-only configuration if a brief freeze is acceptable.

Commit B contains the runtime cutover:

- cached DynamoDB enabled checks in ingress and workers;
- a five-second ingress gate that prevents disabled chats from consuming SQS
  messages or agent-worker concurrency;
- owner-only `/allowai` and `/disallowai`;
- DynamoDB-backed admin `/toggle` with optimistic concurrency;
- least-privilege Lambda IAM;
- `BOT_OWNER_ID` runtime wiring;
- removal of runtime `OPENAI_CHAT_IDS` reads and Redis agentic-chat reads;

The unrelated Redis command-reduction changes belong in commit R, not commit B.

Before deployment, configure the GitHub Actions repository variable
`BOT_OWNER_ID` with the supplied numeric id. Deployment validation must reject
a missing or malformed value.

## Phase 4 - smoke test and observation

Verify in production:

1. A migrated allowed + enabled chat still invokes the agentic bot.
2. A migrated allowed + disabled chat does not invoke it until an admin uses
   `/toggle`.
3. A chat absent from the owner allowlist cannot enable itself with `/toggle`.
4. A non-owner cannot use `/allowai` or `/disallowai`.
5. The owner can allow/disallow the current chat and an explicit numeric chat
   id from a private chat.
6. A regular member cannot use `/toggle`; a creator/administrator can.
7. `/disallowai` also forces `agenticEnabled=false`.
8. DynamoDB errors fail closed in Telegram ingress and enqueue nothing.
9. WebSocket connection/event/statistics tables continue unchanged.
10. Upstash `EVAL`, `GET`, `EXPIRE`, and retention-cleanup traffic falls as
    predicted; unit tests do not contact production Upstash.

Observe Lambda errors, SQS retries/DLQs, DynamoDB throttles, and Upstash command
usage through at least one normal traffic period.

## Rollback

If cutover fails:

1. Redeploy commit A, restoring the old env + Redis runtime.
2. Do not delete or modify the DynamoDB table.
3. Keep the legacy env and Redis state intact.
4. Compare any owner/admin changes made after cutover before attempting another
   migration.

During the initial soak, avoid changing the owner allowlist unless necessary;
the old runtime has no equivalent writable owner allowlist. If exact rollback
of `/toggle` changes is mandatory, use the temporary dual-write bridge instead
of the short-freeze variant.

## Phase 5 - cleanup after a stable soak

Only after the rollback window closes:

- remove the one-time migration script if the project does not keep audited
  operational migrations;
- remove obsolete `OPENAI_CHAT_IDS` deployment configuration;
- remove the legacy Redis agentic-chat code and tests if not already removed in
  commit B;
- optionally delete the obsolete Redis key after recording its value;
- keep the DynamoDB table, retention policies, PITR, and deletion protection.

## Copy-paste review request for Claude

```text
Review the local branches in D:\environment\telegram-bot-app. Do not edit
files, stage, commit, push, deploy, run the migration, or mutate AWS/Redis.

First read AGENTS.md, CHAT_CONFIGURATION_ROLLOUT_PLAN.md, and
REDIS_COMMAND_REDUCTION_REVIEW.md. Then inspect the actual git diff and verify
whether it can be safely reshaped into the staged rollout below:

0. Independent commit/deploy R if urgent: Redis command reductions only, with
   the legacy chat configuration behavior untouched.
1. Commit/deploy A: CloudFormation-owned permanent chat-configuration table and
   migration tooling only; deployed runtime still reads OPENAI_CHAT_IDS + Redis.
2. Dry-run, apply, and strongly verify the legacy snapshot.
3. Final sync during a short /toggle freeze.
4. Commit/deploy B: switch reads/writes to DynamoDB and add owner commands.
5. Keep legacy sources for rollback, observe, then clean up later.

The owner identity must be provided through BOT_OWNER_ID and must not be
hardcoded in committed source or CloudFormation.

Review for concrete correctness and rollout risks, not style preferences. Give
findings first, ordered P0-P3, with exact file and line references. Explicitly
check:

- The table has one String partition key (chatId), no sort key, no TTL,
  PAY_PER_REQUEST billing, deletion protection, DeletionPolicy/UpdateReplacePolicy
  Retain, PITR, and is owned by CloudFormation from creation.
- The migration script does not create the table and fails on a missing or
  incompatible table.
- Mapping preserves legacy behavior exactly:
  aiAllowed = OPENAI_CHAT_IDS; agenticEnabled = OPENAI_CHAT_IDS intersection
  Redis bot-config:agentic-chats.
- Redis-only ids never become active; removed migration-owned ids are disabled;
  reruns are idempotent; owner/admin-updated rows cannot be overwritten.
- No secret or full Lambda environment is printed or written to an artifact.
- The final-sync/freeze closes the old-Redis-to-new-Dynamo race, or identify a
  scenario that still loses a /toggle.
- Only BOT_OWNER_ID can use /allowai and /disallowai. /toggle retains the
  existing Telegram creator/admin check and cannot bypass aiAllowed.
- Concurrent owner disallow and admin toggle cannot leave an enabled but
  disallowed chat or lose an update.
- Enabled checks use a short TTL cache and fail closed. Ingress intentionally
  reads DynamoDB on cache misses so disabled chats do not consume SQS/Lambda.
- IAM is least privilege: ingress/agent/activity read configuration; reply can
  read and update it.
- Rollback to commit A really works because legacy env/Redis remain untouched;
  call out changes made during the Dynamo soak that would not roll back.
- Tests cannot access real Upstash when NODE_ENV=test.
- The WebSocket DynamoDB design and other permanent tables are unaffected.
- Commit A contains no runtime cutover changes.
- Redis reductions can be isolated into commit R without changing legacy
  allowlist or /toggle behavior.

Also estimate DynamoDB requests on a cache miss, /toggle, and /allowai, and flag
any assumption that needs an AWS integration test. End with a go/no-go verdict
for each phase and the minimum fixes required before commit A. Do not suggest a
commit or deployment yourself.
```
