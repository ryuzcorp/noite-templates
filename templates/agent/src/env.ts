import type { AgentSandbox } from "./agent";

/** Worker environment. Runtime values are baked from Settings -> Environment
 * at build time (Worker code cannot see app env vars); they are never
 * committed. */
export interface Env {
  AgentSandbox: DurableObjectNamespace<AgentSandbox>;
  /** Model id for the OpenAI-compatible provider, or exactly "faux". */
  MODEL?: string;
  /** Any OpenAI-compatible chat-completions base URL (default api.openai.com). */
  OPENAI_BASE_URL?: string;
  /** API key for the endpoint. Secret: Settings only, baked at build. */
  OPENAI_API_KEY?: string;
  /** Bearer token gating every /sandboxes/* route. Secret: Settings only. */
  AGENT_TOKEN?: string;
  /** Comma-separated repository host allowlist (default "github.com"). */
  REPO_HOSTS?: string;
  /** Agent runtime: "worker" (default) or "container". */
  AGENT_RUNTIME?: string;
}
