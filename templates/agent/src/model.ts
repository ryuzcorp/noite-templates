/** Model selection parsed from the MODEL env var. Pure: unit-tested. */

export const OPENAI_PROVIDER = "openai" as const;

export type ModelSelection = { kind: "openai"; modelId: string } | { kind: "faux" };

/**
 * Parse MODEL. Exactly "faux" (case-insensitive, surrounding whitespace
 * ignored) selects pi-ai's faux provider for a cred-less test loop.
 * Anything else is a model id for the OpenAI-compatible provider; an empty
 * id fails at resolution with "model not configured", never by silently
 * entering test mode. Unknown ids resolve against the OpenAI catalog on
 * api.openai.com, and against any id on a custom OPENAI_BASE_URL (limits
 * are then approximated from a sibling model).
 */
export function parseModelRef(raw: string | undefined | null): ModelSelection {
  const modelId = (raw ?? "").trim();
  if (modelId.toLowerCase() === "faux") {
    return { kind: "faux" };
  }
  return { kind: "openai", modelId };
}
