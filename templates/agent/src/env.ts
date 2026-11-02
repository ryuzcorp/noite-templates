/** Worker environment as Void exposes it (`c.env` in routes, `context.env`
 * in the Durable Object). Runtime values are baked from Settings ->
 * Environment at build time through `worker.vars` in `void.config.ts`;
 * they are never committed. There is deliberately no env.ts schema: Void
 * refuses `worker.vars` names that duplicate schema server keys. */

export interface Env {
  /** Model id for the OpenAI-compatible provider, or exactly "faux". */
  MODEL?: string;
  /** Any OpenAI-compatible chat-completions base URL (default api.openai.com). */
  OPENAI_BASE_URL?: string;
  /** API key for the endpoint. Secret: Settings only, baked at build. */
  OPENAI_API_KEY?: string;
  /** Bearer [REDACTED] gating every /sandboxes/* route. Secret: Settings only. */
  AGENT_TOKEN?: string;
  /** Comma-separated repository host allowlist (default "github.com"). */
  REPO_HOSTS?: string;
  /** Agent runtime: "worker" (default) or "container". */
  AGENT_RUNTIME?: string;
  /** Cloudflare bindings (SANDBOX, AGENT, ASSETS, ...) alongside the vars. */
  [key: string]: unknown;
}

/** Read one optional string var from the Worker env. Pure. */
export function envString(env: Env, key: string): string | undefined {
  const value = env[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
