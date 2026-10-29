# AGENTS.md

A Pi Durable agent harness in a Worker Durable Object, with a Sandbox
container as the tool backend. One sandbox name = one `AgentSandbox` object =
one container + one durable conversation.

## Commands

| Command | Use it to |
| --- | --- |
| `bun run check` | Typecheck, build, and test. Run it before you finish. |
| `bun run typecheck` | Run `tsc --noEmit`. |
| `bun run build` | Bundle `src/index.ts` to `dist/` and emit `dist/wrangler.json`. |
| `bun run test` | Run the tests with `bun test`. |
| `bun run dev` | Build, then `celld dev` (needs a container engine). |

## Conventions

- Explicit types on exports; early returns; `for..of`.
- Worker (`src/index.ts`) is stateless: validate, route, render. All durable
  state lives in `AgentSandbox` (`src/agent.ts`).
- Tools close over the DO instance (`sandbox.exec`, `readFile`, `writeFile`).
  They return `{ output: [{ type: "text", text }], isError? }`.
- Secrets only via Worker env (`OPENAI_API_KEY`); pi-ai's OpenAI auth reads
  it through a custom `authContext` mapping in `agent.ts`. Never log env.
- Pure helpers live in `src/model.ts` / `src/transcript.ts` /
  `scripts/build.ts` with unit tests in `test/`.
- `wrangler.jsonc` keeps only keys celld accepts (plus `containers`); the
  build allowlists them into `dist/wrangler.json`, rewrites `main`, carries
  `vars` through (Worker code cannot see app env vars), and overrides the
  container image from `$SANDBOX_IMAGE` when set.
