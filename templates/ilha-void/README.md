# Ilha + Void on Noite

A [Noite](https://github.com/ryuzcorp/noite) app template: server-rendered
[Ilha](https://ilha.build) pages on [Void](https://void.cloud), built with
Vite and served by celld.

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

`vite build` writes `dist/wrangler.json` (a celld-ready config derived from
Void's own `dist/ssr/wrangler.json`), the Worker under `dist/ssr/` and the
client assets under `dist/client/`. Noite picks that config up automatically
— there is nothing to configure for a deploy.

If the project pins `packageManager` in `package.json`, Noite installs with
that; otherwise a lockfile decides (`bun.lock` here), defaulting to bun.

## Local development

```sh
bun install
bun run dev        # Vite dev server on http://localhost:5173
bun run typecheck  # builds first: tsc reads the generated route types
bun run test       # component tests with ilha/test
```

## Pages and islands

- `pages/*.tsx` — file-based pages (`/` is `pages/index.tsx`).
- `pages/*.server.ts` — loaders and actions: they run in the Worker, and the
  page reads them as props (`InferProps`) or calls them through `useForm`.
- `pages/*.island.tsx` — island pages: Void sends static HTML, and only the
  imported islands (`.tsx` with `with { island: "load" }`) ship JavaScript.
- `pages/layout.tsx` — wraps every page; keeps its state across navigations.
- `void.config.ts` — the Worker: name, compatibility date, bindings.

## Bindings

`void.config.ts` declares the Worker in its `cloudflare` section. The
template ships a commented D1 example; uncomment it and run `bun run build`
after editing (bindings are read from the built config):

```ts
d1_databases: [{ binding: "DB", database_name: "app-db" }],
```

The platform provisions the database per app on first deploy. Read it in a
server module with `env.DB` from `cloudflare:workers`.

Secrets: set them as env vars on the app (Noite passes them to the build and
the fleet), never in `void.config.ts`.

## Stack

| Piece | Version |
| --- | --- |
| ilha / @ilha/void | ^0.16.0 / ^0.1.4 |
| void | ^1.1.12 |
| effect | ^4 |
| vite | ^8 |

## License

[MIT-0](./LICENSE): copy it into your app, no attribution needed.
