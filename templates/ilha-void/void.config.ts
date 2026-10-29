// The Worker, declared for Void (https://void.cloud): bindings, assets and
// defaults in one typed file. `voidPlugin()` reads it (edits need a dev
// server restart) and the build emits `dist/ssr/wrangler.json`, from which
// `vite.config.ts` (`emitCelldConfig`) derives the deploy-root
// `dist/wrangler.json` Noite deploys with celld.
import { defineConfig } from "void/config";

export default defineConfig({
  cloudflare: {
    // The Worker name celld serves the app as.
    name: "noite-app",
    // Optional D1 example, provisioned per app on first deploy. Uncomment it,
    // run `bun run build` (bindings are read from the built config), and read
    // it in a server module with `env.DB` from `cloudflare:workers`:
    // d1_databases: [{ binding: "DB", database_name: "app-db" }],
  },
  worker: {
    compatibility_date: "2026-09-01",
  },
});
