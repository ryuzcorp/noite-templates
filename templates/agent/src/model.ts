/** Model selection parsed from the MODEL env var. Pure: unit-tested. */

import type { Provider } from "@earendil-works/pi-ai";
export const OPENAI_PROVIDER = "openai" as const;

export type ModelSelection = { kind: "openai"; modelId: string } | { kind: "faux" };

/**
 * Parse MODEL. Exactly "faux" (case-insensitive, surrounding whitespace
 * ignored) selects pi-ai's faux provider for a cred-less test loop.
 * Anything else is a model id for the OpenAI-compatible provider; an empty
 * id fails at resolution with "model not configured", never by silently
 * entering test mode. Unknown ids resolve against the OpenAI catalog on
 * api.openai.com, and against any id on a custom OPENAI_BASE_URL (limits
 * are then approximated from a donor entry).
 */
export function parseModelRef(raw: string | undefined | null): ModelSelection {
  const modelId = (raw ?? "").trim();
  if (modelId.toLowerCase() === "faux") {
    return { kind: "faux" };
  }
  return { kind: "openai", modelId };
}

/** Donor entry custom-endpoint ids clone (limits are approximations). */
export const DONOR_MODEL_ID = "gpt-5-mini";

/**
 * Wrap an OpenAI-compatible provider for one endpoint: the catalog stays
 * authoritative without an endpoint (unknown ids fail closed, catching
 * typos), while a custom endpoint registers any non-empty selected id by
 * cloning the donor entry. Wrapping (not mutating) keeps the shared base
 * provider intact. Pure: unit-tested.
 */
export function withEndpointModels(
  base: Provider,
  endpoint: string | undefined,
  selectedId: string
): Provider {
  return {
    ...base,
    ...(endpoint === undefined ? {} : { baseUrl: endpoint }),
    getModels: () => {
      const known = base.getModels();
      if (
        endpoint !== undefined &&
        selectedId !== "" &&
        !known.some((model) => model.id === selectedId)
      ) {
        const donor = known.find((model) => model.id === DONOR_MODEL_ID) ?? known[0];
        if (donor !== undefined) {
          return [...known, { ...donor, id: selectedId, name: selectedId }];
        }
      }
      return known;
    },
  };
}
