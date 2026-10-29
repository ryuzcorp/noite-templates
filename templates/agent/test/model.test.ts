import { describe, expect, test } from "bun:test";

import { parseModelRef } from "../src/model";

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
