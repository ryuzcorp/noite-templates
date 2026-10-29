# TanStack Start starter

A [Noite](https://github.com/ryuzcorp/noite) app template: [TanStack Start](https://tanstack.com/start)
(React 19, SSR, server functions) on Cloudflare Workers, built with Vite and
`@cloudflare/vite-plugin` and served by celld.

## Deploy on Noite

Noite deploys on push. Point a remote at your app and push `main`:

```sh
git remote add noite https://git.<your-noite-host>/<app-slug>
git push -u noite main
```

Or create the app from this template in the Noite UI (or with the MCP
`create_app` tool) and clone the repo it gives you — that remote is already
configured. Every push to `main` runs install → build → `celld deploy`; the
deployment page shows the log and the live SHA.

The build is the same one you run locally:

```sh
bun install
bun run build
```

`vite build` writes `dist/client` (assets), `dist/server` (the SSR Worker) and
`.wrangler/deploy/config.json` pointing at `dist/server/wrangler.json`. Noite
rewrites that Wrangler-shaped config into the `wrangler.json` celld accepts
(relative `main` and `assets.directory`, `.assetsignore` applied, Wrangler-only
keys dropped) and deploys from there — there is nothing to configure.

If the project pins `packageManager` in `package.json`, Noite installs with
that; otherwise a lockfile decides (`bun.lock` here), defaulting to bun.

## Local development

```sh
bun install
bun run dev        # vite + workerd
bun run typecheck  # builds first: tsc reads the generated route types
```

## Layout

- `src/routes/__root.tsx` — the HTML document shell and root route.
- `src/routes/index.tsx` — the home route: a live greeting and a button that calls a `createServerFn` in the Worker.
- `src/router.tsx` — `getRouter()`, the Start router factory.
- `src/styles/app.css` — Tailwind entry.
- `src/routeTree.gen.ts` — generated from `src/routes/*` on dev and build
  (gitignored, so a fresh clone generates it on the first build).
- `cloudflare.config.ts` — the Worker: name, compatibility, bindings, with the
  typed helpers from `cf/config` instead of a `wrangler.jsonc`. `entrypoint`
  names TanStack Start's server entry; the plugin resolves it.
- `vite.config.ts` — loads `cloudflare.config.ts` and hands it to the
  Cloudflare plugin (restart the dev server after editing the config).

## Bindings

`cloudflare.config.ts` ships one commented D1 example; uncomment it (and import
`bindings` from `cf/config`) for a per-app database, provisioned by the
platform on first deploy:

```ts
env: {
  DB: bindings.d1({ name: "app-db" }),
},
```

Read bindings in a server function through `cloudflare:workers`:

```ts
import { env } from "cloudflare:workers";
```

Secrets: set them as env vars on the app (Noite passes them to the build and
the fleet), never in `cloudflare.config.ts`.

## Stack

| Piece | Version |
| --- | --- |
| @tanstack/react-start | ^1.169.1 |
| @tanstack/react-router | ^1.170.44 |
| react / react-dom | ^19.2.0 |
| @cloudflare/vite-plugin | ^1.63.1 |
| vite | ^8.3.4 |

## License

[MIT-0](./LICENSE): copy it into your app, no attribution needed.
