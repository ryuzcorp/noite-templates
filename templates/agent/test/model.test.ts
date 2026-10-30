import { describe, expect, test } from "bun:test";

import { createModels } from "@earendil-works/pi-ai";
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

  test("the clone carries the completions api and the endpoint", () => {
    const endpoint = "https://x.example/openai";
    const wrapped = withEndpointModels(openaiProvider(), endpoint, "my-model");
    const clone = wrapped.getModels().find((model) => model.id === "my-model");
    expect(clone?.api).toBe("openai-completions");
    expect(clone?.baseUrl).toBe(endpoint);
    // The donor entry keeps routing to api.openai.com over Responses.
    const donor = wrapped.getModels().find((model) => model.id === DONOR_MODEL_ID);
    expect(donor?.api).toBe("openai-responses");
    expect(donor?.baseUrl).toBe("https://api.openai.com/v1");
  });

  test("the default endpoint returns the base provider untouched", () => {
    const base = openaiProvider();
    expect(withEndpointModels(base, undefined, "my-model")).toBe(base);
  });

  test("a custom endpoint routes completion requests to it", async () => {
    const seen: Array<{ method: string; path: string; auth: string | null }> = [];
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        seen.push({ method: req.method, path: url.pathname, auth: req.headers.get("authorization") });
        if (req.method === "POST" && url.pathname.endsWith("/chat/completions")) {
          const enc = new TextEncoder();
          const stream = new ReadableStream({
            start(c) {
              const send = (o: unknown) => c.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
              send({
                id: "stub-1",
                object: "chat.completion.chunk",
                created: 1,
                model: "my-model",
                choices: [{ index: 0, delta: { content: "probe-ok" } }],
              });
              send({
                id: "stub-1",
                object: "chat.completion.chunk",
                created: 1,
                model: "my-model",
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
              });
              c.enqueue(enc.encode("data: [DONE]\n\n"));
              c.close();
            },
          });
          return new Response(stream, { headers: { "content-type": "text/event-stream" } });
        }
        return new Response("not found", { status: 404 });
      },
    });
    try {
      const models = createModels({
        authContext: {
          env: async () => "stub-key",
          fileExists: async () => false,
        },
      });
      const endpoint = `http://127.0.0.1:${server.port}/api/v1`;
      models.setProvider(withEndpointModels(openaiProvider(), endpoint, "my-model"));
      const model = models.getModel("openai", "my-model");
      expect(model).toBeDefined();
      const answer = await models.complete(model!, {
        messages: [{ role: "user", content: "hi", timestamp: Date.now() }],
      });
      expect(seen.map((r) => `${r.method} ${r.path}`)).toEqual(["POST /api/v1/chat/completions"]);
      expect(seen[0]?.auth).toBe("Bearer stub-key");
      expect(JSON.stringify(answer)).toContain("probe-ok");
    } finally {
      server.stop();
    }
  });
});
