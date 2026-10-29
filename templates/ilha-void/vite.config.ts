import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { voidIlha } from "@ilha/void/plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { voidPlugin } from "void";

/** The app root: this config file's own directory. */
const APP_ROOT = import.meta.dirname;

/** Top-level keys `celld deploy` accepts. An unknown key fails the deploy,
 * so anything Void emits outside this set is dropped, never passed through. */
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
] as const;

/** Write the deploy-root `dist/wrangler.json` celld deploys, derived from
 * Void's own `dist/ssr/wrangler.json` (never handwritten): `main` rewrites
 * to deploy-root-relative `ssr/…`, the asset directory to `client`, and
 * `vars` to `{}` (Noite patches the app's real env at deploy time).
 * Void's Cloudflare-only `dist/client/.assetsignore` is removed: `celld
 * deploy` refuses it outright, and its entries need no replacement —
 * `wrangler.json` is celld's config surface (never an asset).
 * Last in the plugin list so its `closeBundle` runs after Void's emit; when
 * the SSR bundle hasn't closed yet it does nothing and the SSR close writes. */
const emitCelldConfig = (): Plugin => ({
  closeBundle() {
    const dist = path.resolve(APP_ROOT, "dist");

    rmSync(path.join(dist, "client", ".assetsignore"), { force: true });

    let emitted: string;

    try {
      emitted = readFileSync(path.join(dist, "ssr", "wrangler.json"), "utf-8");
    } catch {
      return;
    }

    const ssr = JSON.parse(emitted) as Record<string, unknown>;

    const ssrAssets =
      typeof ssr["assets"] === "object" && ssr["assets"] !== null
        ? (ssr["assets"] as Record<string, unknown>)
        : {};

    const ssrMain =
      typeof ssr["main"] === "string" && ssr["main"] ? ssr["main"] : "index.js";

    const config: Record<string, unknown> = {};

    for (const key of CELLD_KEYS) {
      if (key in ssr) {
        config[key] = ssr[key];
      }
    }

    config["main"] = `ssr/${ssrMain}`;
    config["assets"] = {
      ...ssrAssets,
      directory: "client",
      run_worker_first: true,
    };

    // D1 is keyed by name: drop Void's default `migrations_dir` (it points
    // at a directory that does not exist; schema migrates through `void db`,
    // never through wrangler migrations).
    if (Array.isArray(config["d1_databases"])) {
      for (const entry of config["d1_databases"]) {
        if (typeof entry === "object" && entry !== null) {
          delete (entry as Record<string, unknown>)["migrations_dir"];
        }
      }
    }

    config["vars"] = {};
    writeFileSync(
      path.join(dist, "wrangler.json"),
      `${JSON.stringify(config, null, 2)}\n`
    );
  },
  name: "celld-config",
});

export default defineConfig({
  plugins: [voidPlugin(), voidIlha(), tailwindcss(), emitCelldConfig()],
});
