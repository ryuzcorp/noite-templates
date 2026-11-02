# AGENTS.md

A stock Void app (`void` on Vite): a Pi Durable agent harness in a Durable
Object, with a Void Sandbox container as the tool backend. One sandbox name
= one `Agent` object = one container + one durable conversation. Two
runtimes: `worker` (harness in the DO, tools exec in the container) and
`container` (the whole loop runs in the container; the DO brokers model
calls).

## Commands

| Command | Use it to |
| --- | --- |
| `bun run check` | Typecheck, lint, build, and test. Run it before you finish. |
| `bun run typecheck` | Run `tsc --noEmit`. |
| `bun run lint` | Run `oxlint`. |
| `bun run build` | Bundle the agent server into `sandbox/agent/`, then `vite build` (`dist/ssr/wrangler.json` + `dist/client/`). |
| `bun run test` | Run the tests with `bun test`. |
| `bun run dev` | Build the agent server, then `vite` (needs a container engine for sandboxes). |

## Conventions

- Explicit types on exports; early returns; `for..of`.
- Routes (`routes/`, `defineHandler`) are stateless: authenticate, validate,
  route, render. All durable state lives in `Agent`
  (`durable-objects/agent.ts`, `defineDurableState`).
- No request waits on slow work: POSTs record an operation durably and
  answer 202; the DO performs it from the `alarm` hook. Every response
  (including errors) is JSON — a middleware rewrites Hono's plain-text
  404/405.
- Void serializes every DO method and the alarm hook through one queue: no
  `blockConcurrencyWhile`, and background wakeups multiplex through the
  single `alarm` hook via `context.setAlarm` only (see the
  alarm-composition note in `durable-objects/agent.ts`); every callback is
  idempotent. Keep iterations brief: reads queue behind the in-flight one.
- The sandbox client is injected, never imported, in `src/` (`tools.ts`,
  `clone-deps.ts`, `server-client.ts` take structural clients): real
  `getSandbox` in the DO, fakes in tests. No `void/*` import under `src/`
  or `test/` — no Void runtime under bun.
- Worker-mode file tools confine paths to the repo dir (`src/paths.ts` +
  a `realpath` check in the container); `exec` always runs with cwd
  `REPO_DIR`. Commands run as argv; only the legacy string-exec seam uses
  `sh -c`.
- Secrets only via baked Worker env (`OPENAI_API_KEY`, `AGENT_TOKEN`);
  pi-ai's OpenAI auth reads the key through a custom `authContext` mapping
  in the DO. Never log env. Nothing secret is ever sent to the container
  (the server starts with no env; tool envs are curated/minimal).
- Runtime values bake at build time through `worker.vars` in
  `void.config.ts` (Settings -> Environment reaches the build only). There
  is deliberately no `env.ts`: Void refuses vars that duplicate schema
  server keys. Read vars from the Worker env (`c.env` / `context.env`).
- Pure helpers live in `src/*.ts` with unit tests in `test/` (bun test).
  The container pump policy (`src/container-pump.ts`) is
  dependency-injected so tests drive it with fakes; no sleeps or
  wall-clock waits in tests (inject `sleep`/`now`).
- `sandbox/Dockerfile` must stay RUN-free (Noite builds only
  FROM/COPY/WORKDIR/ENV/LABEL/USER/EXPOSE/CMD/ENTRYPOINT/ARG/STOPSIGNAL/MAINTAINER):
  more tools means publishing an image or adding files with `COPY`. The
  shim tag must equal the `@cloudflare/sandbox` version in `bun.lock`
  (`test/dockerfile.test.ts` fails on drift). `sandbox/agent/server.mjs`
  is a build artifact (gitignored); the build writes it before the image
  builds.
- Commit `void.lock.json` (generated Durable Object migration history).
  Never hand-write `dist/` or the generated `.void*` / `.cloudflare/`
  outputs.
- Test placement (`test/*.test.ts`, separate from `src/`) is deliberate
  for this template; ilha-void colocates instead.
