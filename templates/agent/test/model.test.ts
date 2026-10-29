import { describe, expect, test } from "bun:test";

import { parseModelRef } from "../src/model";

describe("parseModelRef", () => {
  test("faux selects the faux provider", () => {
    expect(parseModelRef("faux")).toEqual({ kind: "faux" });
    expect(parseModelRef(" FAUX ")).toEqual({ kind: "faux" });
  });

  test("anything else is a gateway model id", () => {
    expect(parseModelRef("workers-ai/@cf/moonshotai/kimi-k2.6")).toEqual({
      kind: "gateway",
      provider: "cloudflare-ai-gateway",
      modelId: "workers-ai/@cf/moonshotai/kimi-k2.6",
    });
  });

  test("empty never silently enters test mode", () => {
    expect(parseModelRef("")).toEqual({
      kind: "gateway",
      provider: "cloudflare-ai-gateway",
      modelId: "",
    });
    expect(parseModelRef(undefined)).toMatchObject({ kind: "gateway" });
  });
});
