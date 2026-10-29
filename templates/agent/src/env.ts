import type { AgentSandbox } from "./agent";

/** Worker environment. Secrets arrive only as app env vars (Noite Settings
 * -> Environment); they are never committed and never baked into the build. */
export interface Env {
  AgentSandbox: DurableObjectNamespace<AgentSandbox>;
  /** Model id inside the cloudflare-ai-gateway catalog, or exactly "faux". */
  MODEL?: string;
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  /** Cloudflare API token for the AI Gateway. Secret: app env vars only. */
  AI_GATEWAY_TOKEN?: string;
}
