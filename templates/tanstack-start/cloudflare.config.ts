// The Worker, declared for the `cf` CLI (https://github.com/cloudflare/cf):
// bindings and defaults in one typed file. `vite.config.ts` loads it and hands
// it to the Cloudflare plugin (edits need a dev server restart); the build
// emits the Wrangler config Noite converts and deploys with celld.
import { defineConfig, defineWorker } from "cf/config";

const worker = defineWorker({
  compatibilityDate: "2026-01-01",
  compatibilityFlags: ["nodejs_compat"],
  // TanStack Start's Worker entry: the plugin resolves this specifier to the
  // generated SSR bundle.
  entrypoint: "@tanstack/react-start/server-entry",
  env: {
    // Optional D1 example, provisioned per app on first deploy. Read it in a
    // server function through `import { env } from "cloudflare:workers"`
    // (and import `bindings` from "cf/config" above):
    // DB: bindings.d1({ name: "app-db" }),
  },
  name: "noite-tanstack-app",
});

export default defineConfig({ worker });
