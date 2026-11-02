// The Worker, declared for Void (https://void.cloud): bindings, assets and
// defaults in one typed file. `voidPlugin()` reads it (edits need a dev
// server restart) and the build emits `dist/ssr/wrangler.json`, which Noite
// reads natively. There is intentionally no celld-config plugin and no
// `dist/wrangler.json` of our own.
import { defineConfig } from "void/config";

function baked(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value === "" ? undefined : value;
}

// Noite passes the app's Settings env to the build only, so every runtime
// value is baked into worker.vars here at build time; the committed values
// are only fallbacks (never real secrets). These names must NOT also be
// declared as server keys in env.ts (Void refuses that combination).
const OPENAI_API_KEY = baked("OPENAI_API_KEY");
const AGENT_TOKEN = baked("AGENT_TOKEN");

export default defineConfig({
  cloudflare: {
    // The Worker name celld serves the app as.
    name: "noite-agent",
  },
  worker: {
    compatibility_date: "2026-09-01",
    compatibility_flags: ["nodejs_compat"],
    vars: {
      MODEL: baked("MODEL") ?? "gpt-5-mini",
      OPENAI_BASE_URL: baked("OPENAI_BASE_URL") ?? "https://api.openai.com/v1",
      REPO_HOSTS: baked("REPO_HOSTS") ?? "github.com",
      AGENT_RUNTIME: baked("AGENT_RUNTIME") ?? "worker",
      ...(OPENAI_API_KEY === undefined ? {} : { OPENAI_API_KEY }),
      ...(AGENT_TOKEN === undefined ? {} : { AGENT_TOKEN }),
    },
  },
  sandbox: {
    // RUN-free Dockerfile (Noite only builds images using FROM/COPY/WORKDIR/
    // ENV/LABEL/USER/EXPOSE/CMD/ENTRYPOINT/ARG/STOPSIGNAL/MAINTAINER): the
    // non-slim node image ships git, and the shim matches the
    // @cloudflare/sandbox version void installs (see sandbox/Dockerfile and
    // test/dockerfile.test.ts). The container-mode agent server bundle is
    // COPYed in from the build context; `bun run build` writes it first.
    image: "./sandbox/Dockerfile",
  },
});
