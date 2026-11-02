# AGENTS.md

A Pi Durable agent harness in a Worker Durable Object, with a Sandbox
container as the tool backend. One sandbox name = one `AgentSandbox` object =
one container + one durable conversation. Two runtimes: `worker` (harness in
the DO, tools exec in the container) and `container` (the whole loop runs in
the container; the DO brokers model calls).

## Commands

| Command | Use it to |
| --- | --- |
| `bun run check` | Typecheck, lint, build, and test. Run it before you finish. |
| `bun run typecheck` | Run `tsc --noEmit`. |
| `bun run lint` | Run `oxlint`. |
| `bun run build` | Bundle `src/index.ts` to `dist/` (+ the agent server), emit `dist/wrangler.json`. |
| `bun run test` | Run the tests with `bun test`. |
| `bun run dev` | Build, then `celld dev` (needs a container engine). |

## Conventions

- Explicit types on exports; early returns; `for..of`.
- Worker (`src/index.ts`) is stateless: authenticate, validate, route,
  render. All durable state lives in `AgentSandbox` (`src/agent.ts`).
- No request waits on slow work: POSTs record an operation durably and
  answer 202; the DO performs it from scheduled callbacks. Every response
  (including errors) is JSON.
- Never call `setAlarm`/`deleteAlarm` directly: `Container.alarm()` owns
  the DO alarm. Background wakeups go through `this.schedule()` only (see
  the alarm-composition note in `src/agent.ts`); every scheduled callback
  is idempotent.
- Tools close over the DO instance (`this.exec`, `readFile`, `writeFile`).
  They return `{ output: [{ type: "text", text }], isError? }`. Worker-mode
  file tools confine paths to the repo dir (`src/paths.ts` + a `realpath`
  check in the container); `exec` always runs with cwd `REPO_DIR`.
- Secrets only via Worker env (`OPENAI_API_KEY`, `AGENT_TOKEN`); pi-ai's
  OpenAI auth reads the key through a custom `authContext` mapping in
  `agent.ts`. Never log env. Nothing secret is ever sent to the container
  (`setEnvVars` is never called; tool envs are curated/minimal).
- Pure helpers live in `src/*.ts` with unit tests in `test/` (bun test).
  The container pump policy (`src/container-pump.ts`) is
  dependency-injected so tests drive it with fakes; no sleeps or
  wall-clock waits in tests.
- `wrangler.jsonc` keeps only keys celld accepts (plus `containers`); the
  build allowlists them into `dist/wrangler.json`, rewrites `main`, carries
  `vars` through (Worker code cannot see app env vars), bakes the operator
  vars from the build env, overrides the container image from
  `$SANDBOX_IMAGE` when set, and embeds the agent-server bundle text via
  `define` (see `src/container/embedded.ts`).
- Test placement (`test/*.test.ts`, separate from `src/`) is deliberate
  for this template; ilha-void colocates instead.
