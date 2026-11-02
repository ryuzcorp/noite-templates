# Agent on Noite

A [Noite](https://github.com/ryuzcorp/noite) app template: a Pi Durable agent
harness with a Cloudflare Sandbox container as its tool backend. Each named
sandbox is one Durable Object: durable state lives in the object's SQLite
storage (survives restarts and evictions), and model credentials never leave
Worker env — in either runtime.

Two runtimes, one template (`AGENT_RUNTIME`):

- `worker` (default): the harness runs in the Durable Object; the model's
  tools (`exec`, `read_file`, `write_file`) run in the sandbox container.
- `container`: the whole agent loop runs as a process in the container with
  pi-durable's standard coding tools (`bash`/`read`/`write`/`edit`); the DO
  brokers model calls, so the API key never enters the container.

## Architecture

- `src/index.ts` — the Worker: auth, routes, validation, and a small human
  page. All state lives in the Durable Object; the Worker holds no state.
- `src/agent.ts` — `AgentSandbox extends Sandbox`: opens the pi harness
  under `blockConcurrencyWhile` (SQLite via
  `openDurableObjectSqliteStorage`), records repository/task operations
  durably, and performs them from scheduled callbacks. RPC methods:
  `startRepository`, `startTask`, `getSandboxState`, `getDiff`
  (plus the `*Pump`/`harnessWake` alarm callbacks).
- `src/container/agent-server.ts` — the container-mode agent server (plain
  node HTTP): a Harness with the coding tools whose model is a broker
  provider (`src/broker.ts`). Bundled for node by `scripts/build.ts` and
  embedded in the Worker bundle; the DO writes it into the container.
- `src/container-pump.ts` — the DO-side pump policy (submit → long-poll →
  mirror → answer), dependency-injected and unit-tested with fakes.
- `src/auth.ts`, `src/repo-url.ts`, `src/paths.ts`, `src/errors.ts`,
  `src/protocol.ts`, `src/model.ts`, `src/transcript.ts` — pure helpers
  with unit tests.
- `scripts/build.ts` — esbuild bundles to `dist/` plus the deploy-root
  `dist/wrangler.json` derived from `wrangler.jsonc`.

No HTTP request waits on slow work. Noite's edge answers 504 after 30 s
without response headers, while a container cold start can take ~90 s and a
model run minutes — so POSTs durably record an operation and answer 202 at
once; the page (and API clients) poll GET. `busy` derives from durable
harness state (`harness.wake().active` in worker mode, the stored task
record in container mode), never from an instance field.

### Alarm composition (read before touching the pumps)

`AgentSandbox` deliberately has **no `alarm()` override**. The base
`Container.alarm()` owns the DO alarm: its `sleepAfter` loop and its
`container_schedules` table. Every background wakeup here goes through
`this.schedule()`, which inserts a due row that `super.alarm()` executes
and deletes. Direct `setAlarm`/`deleteAlarm` calls would clobber the
container's own schedule and are never used.

Consequences: schedule rows are durable, so a pump chain survives DO
eviction; rows run at-least-once (deleted after the callback returns), so
every callback (`harnessWake`, `repositoryPump`, `agentPump`) is
idempotent; and a container that keeps running keeps the alarm loop alive
by itself, which is also what enforces `sleepAfter`.

### Container-mode broker protocol

`POST /tasks {text}` → `202 {status, bootId}` (409 when busy);
`GET /events?after=<cursor>&wait=<s≤20>` → `{cursor, bootId, run,
pendingRequests, events}` (long-poll: transcript events plus the current
pending model requests and run state); `POST /model/<id> {message}|{error}`
→ `200 {}` (404 for unknown/settled ids); `DELETE /tasks` aborts the run;
`GET /health` is the readiness probe.

Each brokered model call carries the already-normalized transcript (tools
folded into system messages), which the DO replays verbatim with
`completeSimple({messages})` on the configured model (faux supported).
Transcript events are mirrored into DO storage, so GET shows the transcript
even after the container is recycled — and a boot-id change mid-run fails
the task loudly instead of hanging.

## Auth

Every `/sandboxes/*` route requires
`Authorization: Bearer <AGENT_TOKEN>` (constant-time compare).
Without `AGENT_TOKEN` configured the routes answer 503 telling the
operator to set it in Noite Settings → Environment and redeploy. The human
page asks for the token once and keeps it in `localStorage`; it never
renders secrets.

## Environment

Set these in Noite (Settings -> Environment) and redeploy: the build bakes
them into `dist/wrangler.json` vars, so Worker code sees them at runtime.
The committed `wrangler.jsonc` values are only fallbacks. Never commit
real values; rotate by changing Settings and redeploying.

| Var | Required | What |
| --- | --- | --- |
| `AGENT_TOKEN` | yes | Bearer token for every `/sandboxes/*` route. Secret: Settings only, baked at build, never committed. |
| `MODEL` | yes | Model id, e.g. `gpt-5-mini`. The exact value `faux` selects pi-ai's faux provider instead. On a custom endpoint any id works (limits are approximated). |
| `OPENAI_BASE_URL` | no | Any OpenAI-compatible chat-completions base URL (default `https://api.openai.com/v1`). AI Gateway users point this at `https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/openai`. |
| `OPENAI_API_KEY` | for real models | API key for the endpoint. Secret: Settings only, baked at build, never committed. |
| `REPO_HOSTS` | no | Comma-separated repository host allowlist (default `github.com`). |
| `AGENT_RUNTIME` | no | `worker` (default) or `container` (whole agent in the sandbox). |

`MODEL=faux` is test-only: scripted answers, no credentials, but the full
durable loop still runs against the real container. Never use it in
production.

Baking secrets into `dist/wrangler.json` is load-bearing (Worker code
cannot see app env at runtime) and ships the secrets to celld as the
deploy config — the same tradeoff as the model key. `.dev.vars` (local
only) is gitignored; never commit it.

## Repository handling

`POST /repository` accepts only plain `https://host/path` URLs on
`REPO_HOSTS`: userinfo, explicit ports, and other schemes are rejected. A
URL change wipes and re-clones; a full 40-hex SHA ref is fetched
explicitly and checked out detached (the git server must allow fetching
arbitrary SHAs); branches/tags check out normally. Clones carry an
explicit timeout and run in the background.

## Tool confinement (worker mode)

`exec` always runs with cwd `/workspace/repo` server-side (no `cwd`
parameter); `read_file`/`write_file` resolve paths against the repo dir
and refuse escapes (`..`, absolute paths elsewhere, symlinks resolved via
`realpath` in the container). Exec output labels stdout/stderr, has a
default 60 s timeout (model-overridable to 300 s), and is capped. This is
defense-in-depth against accidents and indirect prompt injection, not a
sandbox boundary: the model already has unconstrained `exec` by design —
the container itself is the boundary. Container mode uses the standard
coding tools directly on the checkout with the same understanding, plus a
curated tool environment (no secret inheritance).

The stock container starts with internet access on (the SDK default;
`git clone` needs it), fenced off the node, other nodes, and private
ranges. Outbound code you did not write runs in the container — keep the
secrets in the Worker.

## Local development

```sh
bun install
cp .dev.vars.example .dev.vars   # then fill in the tokens
bun run build
celld dev
```

`bun run build` writes `dist/worker.js`, `dist/agent-server.mjs`, and
`dist/wrangler.json`. The container is the stock `cloudflare/sandbox`
image on the same release line as the `@cloudflare/sandbox` dependency —
no image to build or publish. Setting `SANDBOX_IMAGE=<ref>` at build time
pins a custom image instead (e.g. one with extra toolchain baked in).

The agent server also runs standalone for debugging:
`node dist/agent-server.mjs` (with `AGENT_SERVER_PORT`, `AGENT_SERVER_DIR`,
`AGENT_SERVER_REPO` to point it at scratch dirs).

## Routes

All sandbox routes take `:name` (`[a-z0-9][a-z0-9-]{0,63}`); each name is an
isolated container + conversation. All require the agent token.

| Method + path | Body | Result |
| --- | --- | --- |
| `GET /` | — | Human page: token, name, repo, task, state, diff forms. No auth (static, no secrets). |
| `POST /sandboxes/:name/repository` | `{url, ref?}` | Record a clone/refresh, run it in the background. → `202 {status: "cloning"}`. 400 bad URL/ref/host, 409 while cloning. |
| `POST /sandboxes/:name/task` | `{text}` or raw text | Admit one task, run it in the background. → `202 {status: "running"}`. 409 while a task runs (one run per sandbox), 503 without a model. |
| `GET /sandboxes/:name` | — | `{runtime, busy, model, repository, task, transcript}`. Never waits, never starts the container. (`GET …/task` is a deprecated alias.) |
| `GET /sandboxes/:name/diff` | — | `{commit, status, stat, diff}` from `git` in the container. 409 with no repo, 502 when git fails. |

`repository.status` is `idle|cloning|ready|failed`; `task.status` is
`idle|running|done|failed`, with `error` on failure. Every error response
is JSON: `{error, code?}` with a stable `code` (`task_busy`,
`container_unavailable`, `git_failed`, …). Poll GET instead of holding a
POST: POSTs always answer at once.

## Checks

```sh
bun install
bun run check   # typecheck + lint + build + tests
```

Tests live in `test/` (bun test): pure helpers, the broker round trip, the
pump policy with fakes, and the agent server itself driven end to end with
a faux model and real tools. No sleeps or wall-clock waits.
