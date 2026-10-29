# Noite templates

The starters every [Noite](https://github.com/ryuzcorp/noite) app begins from. `create_app` (and the app creator) clones one folder:

| Template | Folder | For |
| --- | --- | --- |
| `ilha-void` | [`templates/ilha-void`](templates/ilha-void) | Ilha pages on Void (Vite), served by celld. |
| `tanstack-start` | [`templates/tanstack-start`](templates/tanstack-start) | TanStack Start (Vite + the Cloudflare plugin) serving SSR. |
| `agent` | [`templates/agent`](templates/agent) | Pi Durable agent in a Worker DO, tools in a Sandbox container on celld. |

Each folder is a complete project with its own `package.json`, `AGENTS.md` and checks (`bun run check`).

Noite resolves a template by id against this repo at `main`: `https://github.com/ryuzcorp/noite-templates` with path `templates/<id>` (see `apps/noite/src/lib/apps/templates.ts` in the Noite repo). The runner clones the repo and squashes the folder into one initial commit, so history here never leaks into apps.
