// The Worker, declared for Void (https://void.cloud): bindings, assets and
// defaults in one typed file. `voidPlugin()` reads it (edits need a dev
// server restart) and the build emits `dist/ssr/wrangler.json`, which Noite
// reads natively. There is intentionally no celld-config plugin and no
// `dist/wrangler.json` of our own.
import { fileURLToPath } from "node:url";
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

// Absolute: the Noite runner resolves Dockerfile paths inside the repo;
// relative to the deploy root (dist/ssr/) this would be ambiguous.
// `ContainerDurableObject` is the class Void generates for
// durable-objects/container.ts (verified in dist/ssr/wrangler.json after
// every build); the containers entry is what gives that class its
// `ctx.container` handle. A plain container entry (no `scheduling_policy`,
// which celld rejects, and no `runtime` key) names the image with `image:`:
// here a Dockerfile path, which Noite builds. `basic` because the image
// boots an interpreter (node).
const sandboxDockerfile = fileURLToPath(new URL("./sandbox/Dockerfile", import.meta.url));

export default defineConfig({
  cloudflare: {
    // The Worker name celld serves the app as.
    name: "noite-agent",
    containers: [
      {
        // `name` is required by Void's config validation; celld accepts it
        // without using it.
        name: "agent-container",
        class_name: "ContainerDurableObject",
        instance_type: "basic",
        image: sandboxDockerfile,
      },
    ],
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
  // No `sandbox:` section on purpose: Void Sandboxes stay off until celld
  // supports cross-isolate RPC stubs/streams. The container object
  // (durable-objects/container.ts) drives the same RUN-free image directly
  // through `ctx.container`; the container-mode agent server bundle is
  // COPYed in from the build context and `bun run build` writes it first.
});
