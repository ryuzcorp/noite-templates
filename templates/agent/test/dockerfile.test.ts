import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const APP_ROOT = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(APP_ROOT, rel), "utf-8");
}

/** Non-comment, non-empty Dockerfile lines. */
function instructions(dockerfile: string): string[] {
  return dockerfile
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

describe("sandbox Dockerfile", () => {
  test("pins the shim to the @cloudflare/sandbox version in bun.lock", () => {
    const dockerfile = read("sandbox/Dockerfile");
    const from = dockerfile.match(/^COPY --from=docker\.io\/cloudflare\/sandbox:([^\s]+)/m);
    expect(from?.[1]).toBeDefined();
    // bun.lock is JSONC (trailing commas), so match the pinned spec textually.
    const lock = read("bun.lock");
    const pinned = lock.match(/"@cloudflare\/sandbox@([^"]+)"/);
    expect(pinned?.[1]).toBeDefined();
    expect(from?.[1]).toBe(pinned?.[1]);
  });

  test("is RUN-free: only instructions Noite builds", () => {
    const allowed = new Set([
      "FROM",
      "COPY",
      "WORKDIR",
      "ENV",
      "LABEL",
      "USER",
      "EXPOSE",
      "CMD",
      "ENTRYPOINT",
      "ARG",
      "STOPSIGNAL",
      "MAINTAINER",
    ]);
    for (const line of instructions(read("sandbox/Dockerfile"))) {
      const instruction = (line.split(/\s+/)[0] ?? "").toUpperCase();
      if (!allowed.has(instruction)) {
        throw new Error(`forbidden Dockerfile instruction: ${line}`);
      }
    }
  });

  test("has no parser directives, heredocs, or $ in FROM/COPY --from", () => {
    const dockerfile = read("sandbox/Dockerfile");
    for (const line of dockerfile.split("\n")) {
      if (/^#\s*syntax\s*=/i.test(line)) {
        throw new Error(`parser directive refused: ${line}`);
      }
    }
    for (const line of instructions(dockerfile)) {
      if (line.includes("<<")) {
        throw new Error(`heredoc refused: ${line}`);
      }
      const instruction = (line.split(/\s+/)[0] ?? "").toUpperCase();
      if ((instruction === "FROM" || instruction === "COPY") && line.includes("$")) {
        throw new Error(`$ refused in ${instruction}: ${line}`);
      }
    }
  });

  test("uses the non-slim node image (git) and ships the agent server", () => {
    const dockerfile = read("sandbox/Dockerfile");
    expect(dockerfile).toMatch(/^FROM node:26\.12\.1-trixie$/m);
    expect(dockerfile).toContain("COPY agent/server.mjs /opt/agent/server.mjs");
    expect(dockerfile).toContain("WORKDIR /workspace");
  });
});
