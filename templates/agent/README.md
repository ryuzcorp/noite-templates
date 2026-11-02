# Agent on Noite

A [Noite](https://github.com/ryuzcorp/noite) app template: a stock [Void](https://void.cloud) app
serving a Pi Durable agent harness with a container as its tool backend. Each named sandbox is
one agent Durable Object plus one container Durable Object: durable state lives in the agent
object's storage (SQLite tables for the harness transcript, records for repo/task state — all
surviving restarts and evictions), the container object drives the container directly through
`ctx.container`, and model credentials never leave Worker env — in either runtime.

The direct container is deliberate, not legacy: celld cannot pass RPC stubs or streams across
isolate boundaries yet, and Void's sandbox client returns both. [Void
Sandboxes](https://void.cloud/guide/sandboxes) will replace the direct container once celld
supports cross-isolate RPC stubs/streams; the agent object keeps its shape and only its
sandbox client changes.

Two runtimes, one template (`AGENT_RUNTIME`):

- `worker` (default): the harness runs in the Durable Object; the model's
  tools (`exec`, `read_file`, `write_file`) run in the sandbox container.
- `container`: the whole agent loop runs as a process in the container with
  pi-durable's standard coding tools (`bash`/`read`/`write`/`edit`); the DO
  brokers model calls, so the API key never enters the container.

## Architecture

- `routes/` — Void file routes (`defineHandler`): auth, validation, and rendering. All state
  lives in the Durable Object; routes hold no state.
- `durable-objects/agent.ts` — the per-sandbox agent object (`defineDurableState`): opens the pi
  harness under `openDurableObjectSqliteStorage`, records repository/task operations durably, and
  performs them from the `alarm` hook. RPC methods: `startRepository`, `startTask`,
  `getSandboxState`, `getDiff`.
- `durable-objects/container.ts` — the per-sandbox container object (native class via
  `defineDurableObject`, declared in the config's `containers[]`): owns the `ctx.container`
  handle, starts the container with internet egress, runs exec to completion, and proxies HTTP
  to container ports. Every RPC takes and returns plain data only (strings, numbers, plain
  objects, ArrayBuffers) — the celld rule for DO↔DO calls; `fetch` answers with a `Response`
  through `stub.fetch()` instead.
- `src/container/agent-server.ts` — the container-mode agent server (plain
  node HTTP): a Harness with the coding tools whose model is a broker
  provider (`src/broker.ts`). Bundled for node by `scripts/build-agent-server.ts` into
  `sandbox/agent/server.mjs`, COPYed into the image at `/opt/agent/server.mjs`, and started there
  by the DO with `node`.
- `src/server-client.ts` — the DO-side client for that server (start + `sandbox.fetch`), with the
  pump policy in `src/container-pump.ts` (submit → poll → mirror → answer), dependency-injected
  and unit-tested with fakes.
- `src/tools.ts`, `src/clone-deps.ts` — the worker-mode tools and the clone seam over an injected
  sandbox client, unit-tested with fakes.
- `src/container-adapter.ts` — the sandbox client over the container object: `run`/`exec`/`fetch`
  plus file operations composed from exec (`test -e`, `cat`, stdin-fed `cat >`). Timeouts cross
  as milliseconds (signals cannot cross the DO↔DO call). Unit-tested with fakes.
- `src/auth.ts`, `src/repo-url.ts`, `src/sandbox-name.ts`, `src/paths.ts`, `src/errors.ts`,
  `src/protocol.ts`, `src/model.ts`, `src/transcript.ts`, `src/page.ts` — pure helpers with unit
  tests.
- `void.config.ts`, `vite.config.ts` — stock Void config: `vite build` writes
  `dist/ssr/wrangler.json` (read natively by Noite) + `dist/client/`, with the `containers[]`
  entry for the container class passed through the `cloudflare` field. No `sandbox:` section
  (see above), no celld-config plugin, no `dist/wrangler.json` of our own.
- `sandbox/Dockerfile` — the RUN-free sandbox image (see below). `void.lock.json` pins the
  generated Durable Object migration history; commit it.

No HTTP request waits on slow work. Noite's edge answers 504 after 30 s
without response headers, while a container cold start can take ~90 s and a
model run minutes — so POSTs durably record an operation and answer 202 at
once; the page (and API clients) poll GET. `busy` derives from durable
harness state (`harness.wake().active` in worker mode, the stored task
record in container mode), never from an instance field.

### Alarm composition (read before touching the pumps)

Void serializes every Durable Object method and the `alarm` hook through one
queue, so this object owns a single alarm and needs no other concurrency
gate. Every background wakeup (clone pump, harness wake, container pump)
multiplexes through the `alarm` hook via `context.setAlarm`: clone first
(nothing else can be pending while a clone runs), then the runtime's pump,
re-arming while work remains. Alarms are durable, so a pump chain survives
DO eviction; they run at-least-once, so every callback is idempotent.

One consequence of the stock shape: reads queue behind the in-flight
iteration, so iterations stay brief (short pump polls, a bounded harness
drive) and a GET during a run can take a few seconds. That is expected —
never a hang, and POSTs still answer at once.

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
them into `dist/ssr/wrangler.json` vars through `worker.vars` in `void.config.ts`, so Worker code
sees them at runtime. The committed fallbacks are only defaults. Never commit
real values; rotate by changing Settings and redeploying. There is deliberately no `env.ts`
schema: Void refuses `worker.vars` names that duplicate schema server keys, so routes and the DO
read these straight from the Worker env.

| Var | Required | What |
| --- | --- | --- |
| `AGENT_TOKEN` | yes | Bearer [REDACTED] for every `/sandboxes/*` route. Secret: Settings only, baked at build, never committed. |
| `MODEL` | yes | Model id, e.g. `gpt-5-mini`. The exact value `faux` selects pi-ai's faux provider instead. On a custom endpoint any id works (limits are approximated). |
| `OPENAI_BASE_URL` | no | Any OpenAI-compatible chat-completions base URL (default `https://api.openai.com/v1`). AI Gateway users point this at `https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/openai`. |
| `OPENAI_API_KEY` | for real models | API key for the endpoint. Secret: Settings only, baked at build, never committed. |
| `REPO_HOSTS` | no | Comma-separated repository host allowlist (default `github.com`). |
| `AGENT_RUNTIME` | no | `worker` (default) or `container` (whole agent in the sandbox). |

`MODEL=faux` is test-only: scripted answers, no credentials, but the full
durable loop still runs against the real container. Never use it in
production.

Baking secrets into the built vars is load-bearing (Worker code cannot see
app env at runtime) and ships the secrets to celld as the deploy config —
the same tradeoff as the model key.

## Sandbox image

`sandbox/Dockerfile` is the sandbox image, and it must stay RUN-free: Noite
only builds Dockerfiles using `FROM`, `COPY`, `WORKDIR`, `ENV`, `LABEL`,
`USER`, `EXPOSE`, `CMD`, `ENTRYPOINT`, `ARG`, `STOPSIGNAL`, `MAINTAINER` —
no `RUN`, `ADD`, `ONBUILD`, `SHELL`, `HEALTHCHECK`, `VOLUME`, no parser
directives, no heredocs, no `$` in `FROM` or `COPY --from`. Local `COPY`
sources must sit inside `sandbox/` (the build context).

The non-slim `node:26.12.1-trixie` base ships git. There is deliberately no
`sandbox-shim`: the container object drives the image directly through
`ctx.container` (the engine exec API and bridge networking need no
in-container agent), so nothing consumes the `@cloudflare/sandbox` shim and
the Dockerfile pins no version (`test/dockerfile.test.ts` fails if a shim
reference returns). Need more tools than git/node/sh? Either publish an image
and point the `containers[]` entry at it, or add files with `COPY` — never
`RUN`.

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

The container starts with internet access on (`enableInternet`, which `git
clone` needs), fenced off the node, other nodes, and private ranges.
Outbound code you did not write runs in the container — keep the secrets in
the Worker.

## Local development

```sh
bun install
# Create .env with the vars from the Environment table above (never commit
# it; there is no .env.example — Void allows only .env locally).
bun run build
bun run dev            # worker only; containers need a celld deploy (lab)
```

`bun run build` bundles the agent server into `sandbox/agent/server.mjs`
(build artifact, gitignored) and runs `vite build`, which writes
`dist/ssr/wrangler.json` + `dist/client/`. Noite deploys that config to
celld, which builds the sandbox image from `sandbox/Dockerfile` — so
exercising sandboxes end to end needs a deploy, not just `bun run dev`.

The agent server also runs standalone for debugging:
`node sandbox/agent/server.mjs` after a build (with `AGENT_SERVER_PORT`,
`AGENT_SERVER_DIR`, `AGENT_SERVER_REPO` to point it at scratch dirs).

## Routes

All sandbox routes take `:name` (`[a-z0-9][a-z0-9-]{0,62}`); each name is
an isolated container + conversation. All require the agent token. Every
response is JSON, including errors.

| Method + path | Body | Result |
| --- | --- | --- |
| `GET /` | — | Human page: token, name, repo, task, state, diff forms. No auth (static, no secrets). |
| `POST /sandboxes/:name/repository` | `{url, ref?}` | Record a clone/refresh, run it in the background. → `202 {status: "cloning"}`. 400 bad URL/ref/host, 409 while cloning. |
| `POST /sandboxes/:name/task` | `{text}` or raw text | Admit one task, run it in the background. → `202 {status: "running"}`. 409 while a task runs (one run per sandbox), 503 without a model. |
| `GET /sandboxes/:name` | — | `{runtime, busy, model, repository, task, transcript}`. Never waits, never starts the container. |
| `GET /sandboxes/:name/diff` | — | `{commit, status, stat, diff}` from `git` in the container. 409 with no repo, 502 when git fails. |

`repository.status` is `idle|cloning|ready|failed`; `task.status` is
`idle|running|done|failed`, with `error` on failure. Every error response
is JSON: `{error, code?}` with a stable `code` (`task_busy`,
`container_unavailable`, `git_failed`, …). Poll GET instead of holding a
POST: POSTs always answer at once. (The old `GET …/task` alias is gone.)

## Checks

```sh
bun install
bun run check   # typecheck + lint + build + tests
```

Tests live in `test/` (bun test): pure helpers, the clone/tools/server
adapters with fake sandbox clients, the container adapter (exec/stdin/fetch
mapping over a fake container client), the broker round trip, the pump policy
with fakes, the Dockerfile shape (RUN-free, no shim), and the agent server
itself driven end to end with a faux model and real tools. No Void runtime
under bun, no sleeps or wall-clock waits.
