import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

/**
 * Bundle src/container/agent-server.ts (esbuild, platform node) into the
 * sandbox build context at sandbox/agent/server.mjs, before `vite build`.
 * The Dockerfile COPYs it into the image (`/opt/agent/server.mjs`); the DO
 * starts it with `node` in container mode. The bundle is a build artifact
 * (gitignored), regenerated on every build.
 */

const APP_ROOT = path.resolve(import.meta.dirname, "..");

async function main(): Promise<void> {
  const outdir = path.join(APP_ROOT, "sandbox", "agent");
  mkdirSync(outdir, { recursive: true });
  await build({
    entryPoints: [path.join(APP_ROOT, "src", "container", "agent-server.ts")],
    outfile: path.join(outdir, "server.mjs"),
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    logLevel: "warning",
  });
  const bundled = readFileSync(path.join(outdir, "server.mjs"), "utf-8");
  if (!bundled.includes("agent-server ready")) {
    throw new Error("agent server bundle looks wrong (missing the ready marker)");
  }
}

if (import.meta.main) {
  await main();
}
