/** Model selection parsed from the MODEL env var. Pure: unit-tested. */

import {
  type Api,
  type ApiStreamOptions,
  type Model,
  type Provider,
  type SimpleStreamOptions,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
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

/** Chat API every OpenAI-compatible endpoint speaks (OpenAI, Azure, Ollama, vLLM, OpenRouter, ...). */
const COMPLETIONS_API = "openai-completions" as const;

/**
 * Wrap an OpenAI-compatible provider for one endpoint: the catalog stays
 * authoritative without an endpoint (unknown ids fail closed, catching
 * typos), while a custom endpoint registers any non-empty selected id by
 * cloning the donor entry. Wrapping (not mutating) keeps the shared base
 * provider intact. Pure: unit-tested.
 *
 * pi-ai dispatches on the MODEL entry (`model.api` picks the implementation,
 * `model.baseUrl` the host): a provider-level `baseUrl` spread is silently
 * ignored and the stock openai provider only wires the Responses API, so the
 * clone carries `api: "openai-completions"` + the endpoint and stream calls
 * for it delegate to the completions implementation. The clone also pins
 * `supportsDeveloperRole: false`: it inherits the donor's `reasoning: true`,
 * which would otherwise make pi-ai send system instructions as `developer`
 * messages that strict OpenAI-compatible servers reject (`system` works
 * everywhere). Everything else (catalog models, classifiers, filters)
 * delegates to the base provider.
 */
export function withEndpointModels(
  base: Provider,
  endpoint: string | undefined,
  selectedId: string
): Provider {
  if (endpoint === undefined) {
    return base;
  }
  const known = base.getModels();
  if (selectedId === "" || known.some((model) => model.id === selectedId)) {
    return base;
  }
  const donor = known.find((model) => model.id === DONOR_MODEL_ID) ?? known[0];
  if (donor === undefined) {
    return base;
  }
  const clone: Model<Api> = {
    ...donor,
    id: selectedId,
    name: selectedId,
    api: COMPLETIONS_API,
    baseUrl: endpoint,
    compat: { ...donor.compat, supportsDeveloperRole: false },
  };
  const completions = openAICompletionsApi();
  return {
    ...base,
    baseUrl: endpoint,
    getModels: () => [...known, clone],
    getAllModels: () => [...(base.getAllModels?.() ?? known), clone],
    stream: (model: Model<Api>, context: TranscriptContext, options?: ApiStreamOptions<Api>) =>
      model.api === COMPLETIONS_API
        ? completions.stream(model, context, options)
        : base.stream(model, context, options),
    streamSimple: (model: Model<Api>, context: TranscriptContext, options?: SimpleStreamOptions) =>
      model.api === COMPLETIONS_API
        ? completions.streamSimple(model, context, options)
        : base.streamSimple(model, context, options),
  };
}
