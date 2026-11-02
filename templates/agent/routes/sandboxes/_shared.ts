import type { Env } from "../../src/env";

/**
 * Shared request plumbing for the sandbox routes (this file starts with
 * `_`, so Void excludes it from routing). All state lives in the Agent
 * Durable Object (one per :name); routes only authenticate, route,
 * validate, and render. Model credentials never leave Worker env.
 *
 * No request waits on slow work: POSTs durably record an operation and
 * answer 202 at once (the edge 504s past 30 s without headers); the page
 * polls GET for progress. Every route response is JSON — including errors.
 */

export function workerEnv(env: Record<string, unknown>): Env {
  return env as unknown as Env;
}
