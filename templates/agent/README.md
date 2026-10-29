# Agent on Noite

A [Noite](https://github.com/ryuzcorp/noite) app template: a Pi Durable agent
harness running in a Worker Durable Object, with a Cloudflare Sandbox
container as its tool backend. Each named sandbox is one Durable Object: the
conversation transcript lives in the object's SQLite storage (survives
restarts and evictions), and the model's tools (`exec`, `read_file`,
`write_file`) run inside that sandbox's container.

## Architecture

- `src/index.ts` — the Worker: routes, validation, and a small human page.
  All state lives in the Durable Object; the Worker holds no state.
- `src/agent.ts` — `AgentSandbox extends Sandbox`: opens the pi harness in
  `blockConcurrencyWhile` (SQLite via `openDurableObjectSqliteStorage`),
  arms the DO alarm from the harness `onWake` callback, and exposes four RPC
  methods: `ensureRepository`, `submitTask`, `getState`, `getDiff`.
- `src/model.ts`, `src/transcript.ts` — pure helpers (model selection,
  transcript rendering), covered by unit tests.
- `scripts/build.ts` — esbuild bundle to `dist/worker.js` plus the
  deploy-root `dist/wrangler.json` derived from `wrangler.jsonc`.

Model calls stay in the Worker (pi-ai `cloudflare-ai-gateway` provider, token
in Worker env). The container is the tool backend only: it runs the checked
out repo and the agent's commands, and never sees credentials.

## Engine requirement

The fleet host needs a container engine: every node that serves a container
class needs a Docker or Podman daemon (`DOCKER_HOST`, or the default socket).
A node without an engine cannot activate the `AgentSandbox` cell. Containers
start with internet access on (`enableInternet` defaults to true in the SDK;
celld fences the container off the node, other nodes, and private ranges),
which `git clone` needs. That is the tradeoff: outbound code you did not write
runs in the container, so keep the secrets in the Worker.

## Environment

Set these in Noite (Settings -> Environment) and redeploy: the build bakes
them into `dist/wrangler.json` vars, so Worker code sees them at runtime.
The committed `wrangler.jsonc` values are only fallbacks (and `MODEL=faux`
works with no credentials at all). Never commit real values.

| Var | Required | What |
| --- | --- | --- |
| `MODEL` | yes | Model id inside the `cloudflare-ai-gateway` catalog, e.g. `workers-ai/@cf/moonshotai/kimi-k2.6`. The exact value `faux` selects pi-ai's faux provider instead. |
| `AI_GATEWAY_ACCOUNT_ID` | for gateway | Cloudflare account id for the AI Gateway. |
| `AI_GATEWAY_ID` | for gateway | AI Gateway id. |
| `AI_GATEWAY_TOKEN` | for gateway | Cloudflare API token. Secret: Settings only, baked at build, never committed. |

`MODEL=faux` is test-only: scripted answers, no credentials, but the full
durable loop (submit -> generation -> answer) still runs against the real
container. Never use it in production.

## Local development

```sh
bun install
cp .dev.vars.example .dev.vars   # if present; otherwise create it
bun run build
celld dev
```

`bun run build` writes `dist/worker.js` and `dist/wrangler.json`. The container
is the stock `cloudflare/sandbox` image on the same release line as the
`@cloudflare/sandbox` dependency — no image to build or publish. Setting
`SANDBOX_IMAGE=<ref>` at build time pins a custom image instead (e.g. one
with extra toolchain baked in).

## Routes

All sandbox routes take `:name` (`[a-z0-9][a-z0-9-]{0,63}`); each name is an
isolated container + conversation.

| Method + path | Body | Result |
| --- | --- | --- |
| `GET /` | — | Human page: name, repo, task, state, diff forms. |
| `POST /sandboxes/:name/repository` | `{url, ref?}` | Clone (shallow) or refresh the checkout at `/workspace/repo`. -> `{commit?}` |
| `POST /sandboxes/:name/task` | `{text}` or raw text | Submit task text, wait for the answer. -> `{answer, transcript}`. 503 without gateway creds. |
| `GET /sandboxes/:name/task` | — | `{busy, model, repository, transcript}`. No model calls. |
| `GET /sandboxes/:name/diff` | — | `{commit, status, diff}` from `git` in the container. 409 with no repo. |

`busy` is instance-local: it is true while this object instance is awaiting an
answer. Poll `GET /task` for the transcript instead of holding `POST /task`
past the Worker time limit on long runs.

## Checks

```sh
bun install
bun run check   # typecheck + build + tests
```
