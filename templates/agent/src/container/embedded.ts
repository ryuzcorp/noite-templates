/**
 * The container-mode agent server bundle, embedded as text at build time.
 * `scripts/build.ts` bundles `agent-server.ts` (esbuild, platform node)
 * and substitutes AGENT_SERVER_SOURCE via `define`; the DO writes the text
 * into the container and starts it with `node`.
 */
declare const AGENT_SERVER_SOURCE: string | undefined;

export function agentServerSource(): string {
  if (typeof AGENT_SERVER_SOURCE === "string" && AGENT_SERVER_SOURCE.length > 0) {
    return AGENT_SERVER_SOURCE;
  }
  throw new Error("agent server bundle is not embedded; build with scripts/build.ts");
}
