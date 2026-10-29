import { describe, expect, test } from "bun:test";

import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";

import { DONOR_MODEL_ID, parseModelRef, withEndpointModels } from "../src/model";

describe("parseModelRef", () => {
  test("faux selects the faux provider", () => {
    expect(parseModelRef("faux")).toEqual({ kind: "faux" });
    expect(parseModelRef(" FAUX ")).toEqual({ kind: "faux" });
  });

  test("anything else is an OpenAI-compatible model id", () => {
    expect(parseModelRef("gpt-5-mini")).toEqual({ kind: "openai", modelId: "gpt-5-mini" });
  });

  test("empty never silently enters test mode", () => {
    expect(parseModelRef("")).toEqual({ kind: "openai", modelId: "" });
    expect(parseModelRef(undefined)).toMatchObject({ kind: "openai" });
  });
});

describe("withEndpointModels", () => {
  test("a custom endpoint registers an unknown selected id once", () => {
    const wrapped = withEndpointModels(openaiProvider(), "https://x.example/openai", "my-model");
    const ids = wrapped.getModels().map((model) => model.id);
    expect(ids.filter((id) => id === "my-model")).toHaveLength(1);
    // The donor entry itself is untouched.
    expect(ids.filter((id) => id === DONOR_MODEL_ID)).toHaveLength(1);
  });

  test("the default endpoint stays catalog-strict", () => {
    const wrapped = withEndpointModels(openaiProvider(), undefined, "my-model");
    expect(wrapped.getModels().some((model) => model.id === "my-model")).toBe(false);
    expect(wrapped.getModels().some((model) => model.id === DONOR_MODEL_ID)).toBe(true);
  });

  test("known and empty ids are never duplicated", () => {
    const base = openaiProvider();
    const before = base.getModels().length;
    expect(withEndpointModels(base, "https://x.example/openai", DONOR_MODEL_ID).getModels()).toHaveLength(
      before
    );
    expect(withEndpointModels(base, "https://x.example/openai", "").getModels()).toHaveLength(before);
  });
});
