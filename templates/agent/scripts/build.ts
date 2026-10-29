import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

/**
 * Bundle src/index.ts to dist/worker.js and write the deploy-root
 * dist/wrangler.json celld deploys, derived from the committed
 * wrangler.jsonc (never handwritten): `main` becomes deploy-root-relative,
 * the container image pins to $SANDBOX_IMAGE when set (CI pushes a
 * sha-tagged image on main), and `vars` carry over from the committed
 * config. Noite app env vars never reach Worker code at runtime, so runtime
 * values (MODEL, AI_GATEWAY_*) live in vars; $AI_GATEWAY_TOKEN at build
 * time (Settings -> Environment reaches the build) overrides the committed
 * placeholder without touching git.
 */

const APP_ROOT = path.resolve(import.meta.dirname, "..");

/** Top-level keys `celld deploy` accepts: the void template's set plus
 * `containers` (the agent's tool backend). An unknown key fails the deploy,
 * so anything outside this set is dropped, never passed through. */
const CELLD_KEYS = [
  "$schema",
  "name",
  "main",
  "compatibility_date",
  "compatibility_flags",
  "durable_objects",
  "migrations",
  "assets",
  "services",
  "triggers",
  "vars",
  "d1_databases",
  "kv_namespaces",
  "queues",
  "workflows",
  "r2_buckets",
  "containers",
] as const;

/** Strip // and block comments outside string literals. Pure: unit-tested. */
export function stripJsonc(source: string): string {
  let out = "";
  let index = 0;
  let inString = false;
  let escaped = false;
  while (index < source.length) {
    const char = source[index];
    if (inString) {
      out += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      index += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      index += 1;
      continue;
    }
    if (char === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        out += source[index] === "\n" ? "\n" : "";
        index += 1;
      }
      index += 2;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/** Derive the deploy config from parsed wrangler.jsonc. Pure: unit-tested. */
export function deriveCelldConfig(
  parsed: Record<string, unknown>,
  imageOverride: string | undefined,
  tokenOverride: string | undefined
): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const key of CELLD_KEYS) {
    if (key in parsed) {
      config[key] = parsed[key];
    }
  }
  config["main"] = "worker.js";
  if (imageOverride !== undefined && imageOverride !== "") {
    const containers = config["containers"];
    if (!Array.isArray(containers) || containers.length === 0) {
      throw new Error("wrangler.jsonc has no containers entry to pin the image on");
    }
    const first = containers[0];
    if (typeof first !== "object" || first === null) {
      throw new Error("wrangler.jsonc containers entry is not an object");
    }
    (first as Record<string, unknown>)["image"] = imageOverride;
  }
  const vars =
    config["vars"] !== undefined && typeof config["vars"] === "object" && config["vars"] !== null
      ? (config["vars"] as Record<string, unknown>)
      : {};
  if (tokenOverride !== undefined && tokenOverride !== "") {
    vars["AI_GATEWAY_TOKEN"] = tokenOverride;
  }
  config["vars"] = vars;
  return config;
}

async function main(): Promise<void> {
  const raw = readFileSync(path.join(APP_ROOT, "wrangler.jsonc"), "utf-8");
  const parsed = JSON.parse(stripJsonc(raw)) as Record<string, unknown>;
  const config = deriveCelldConfig(
    parsed,
    process.env["SANDBOX_IMAGE"]?.trim() || undefined,
    process.env["AI_GATEWAY_TOKEN"]?.trim() || undefined
  );

  mkdirSync(path.join(APP_ROOT, "dist"), { recursive: true });
  writeFileSync(
    path.join(APP_ROOT, "dist", "wrangler.json"),
    `${JSON.stringify(config, null, 2)}\n`
  );

  await build({
    entryPoints: [path.join(APP_ROOT, "src", "index.ts")],
    outfile: path.join(APP_ROOT, "dist", "worker.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    logLevel: "warning",
    // Resolved by the runtime, not the bundle: workerd provides
    // cloudflare:workers, and nodejs_compat (see compatibility_flags)
    // provides the node:* builtins the Sandbox SDK imports.
    external: ["cloudflare:workers", "node:*"],
  });
}

if (import.meta.main) {
  await main();
}
