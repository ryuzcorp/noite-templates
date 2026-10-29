import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

/**
 * Bundle src/index.ts to dist/worker.js and write the deploy-root
 * dist/wrangler.json celld deploys, derived from the committed
 * wrangler.jsonc (never handwritten): `main` becomes deploy-root-relative,
 * the container image pins to $SANDBOX_IMAGE when set (default is the
 * stock cloudflare/sandbox image), and `vars` carry over from the
 * committed config. Noite app env vars never reach Worker code at runtime,
 * so every runtime value (MODEL, AI_GATEWAY_*) is set in Settings ->
 * Environment and baked in here at build time; the committed vars are
 * only fallbacks. Nothing is committed: overrides never touch git.
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

/** Build-time env that overrides the committed config (Settings ->
 * Environment reaches the build; Worker code never sees app env vars). */
export interface BuildEnv {
  readonly AI_GATEWAY_ACCOUNT_ID?: string | undefined;
  readonly AI_GATEWAY_ID?: string | undefined;
  readonly AI_GATEWAY_TOKEN?: string | undefined;
  readonly MODEL?: string | undefined;
  readonly SANDBOX_IMAGE?: string | undefined;
}

/** Derive the deploy config from parsed wrangler.jsonc. Pure: unit-tested. */
export function deriveCelldConfig(
  parsed: Record<string, unknown>,
  buildEnv: BuildEnv = {},
): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const key of CELLD_KEYS) {
    if (key in parsed) {
      config[key] = parsed[key];
    }
  }
  config["main"] = "worker.js";
  const image = buildEnv.SANDBOX_IMAGE?.trim();
  if (image !== undefined && image !== "") {
    const containers = config["containers"];
    if (!Array.isArray(containers) || containers.length === 0) {
      throw new Error("wrangler.jsonc has no containers entry to pin the image on");
    }
    const first = containers[0];
    if (typeof first !== "object" || first === null) {
      throw new Error("wrangler.jsonc containers entry is not an object");
    }
    (first as Record<string, unknown>)["image"] = image;
  }
  const vars =
    config["vars"] !== undefined && typeof config["vars"] === "object" && config["vars"] !== null
      ? (config["vars"] as Record<string, unknown>)
      : {};
  for (const key of [
    "MODEL",
    "AI_GATEWAY_TOKEN",
    "AI_GATEWAY_ACCOUNT_ID",
    "AI_GATEWAY_ID",
  ] as const) {
    const value = buildEnv[key]?.trim();
    if (value !== undefined && value !== "") {
      vars[key] = value;
    }
  }
  config["vars"] = vars;
  return config;
}

async function main(): Promise<void> {
  const raw = readFileSync(path.join(APP_ROOT, "wrangler.jsonc"), "utf-8");
  const parsed = JSON.parse(stripJsonc(raw)) as Record<string, unknown>;
  const config = deriveCelldConfig(parsed, {
    AI_GATEWAY_ACCOUNT_ID: process.env["AI_GATEWAY_ACCOUNT_ID"],
    AI_GATEWAY_ID: process.env["AI_GATEWAY_ID"],
    AI_GATEWAY_TOKEN: process.env["AI_GATEWAY_TOKEN"],
    MODEL: process.env["MODEL"],
    SANDBOX_IMAGE: process.env["SANDBOX_IMAGE"],
  });
  mkdirSync(path.join(APP_ROOT, "dist"), { recursive: true });
  writeFileSync(
    path.join(APP_ROOT, "dist", "wrangler.json"),
    `${JSON.stringify(config, null, 2)}\n`,
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
