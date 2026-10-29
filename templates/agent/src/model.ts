/** Model selection parsed from the MODEL env var. Pure: unit-tested. */

export const GATEWAY_PROVIDER = "cloudflare-ai-gateway" as const;

export type ModelSelection =
  | { kind: "gateway"; provider: typeof GATEWAY_PROVIDER; modelId: string }
  | { kind: "faux" };

/**
 * Parse MODEL. Exactly "faux" (case-insensitive, surrounding whitespace
 * ignored) selects pi-ai's faux provider for a cred-less test loop.
 * Anything else is a model id inside the cloudflare-ai-gateway catalog; an
 * empty or unknown id fails at resolution with "model not configured",
 * never by silently entering test mode.
 */
export function parseModelRef(raw: string | undefined | null): ModelSelection {
  const modelId = (raw ?? "").trim();
  if (modelId.toLowerCase() === "faux") {
    return { kind: "faux" };
  }
  return { kind: "gateway", provider: GATEWAY_PROVIDER, modelId };
}
