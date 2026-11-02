import { describe, expect, test } from "bun:test";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels, fauxAssistantMessage } from "@earendil-works/pi-ai";
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { ConversationBusy, Harness, createRegistry } from "@earendil-works/pi-durable";
import { MemoryStorage } from "@earendil-works/pi-durable/storage/memory";

/**
 * Pins the pi-durable semantics agent.ts relies on: `waitForIdle` covers
 * root-conversation runs (harnessWake drives on it), `wake().active` marks
 * busy (GET derives `busy` from it), and `whenBusy: "reject"` refuses a
 * concurrent submit with ConversationBusy (POST answers 409).
 */
describe("harness semantics the template depends on", () => {
  test("waitForIdle covers a root run; wake marks busy", async () => {
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    faux.setResponses([fauxAssistantMessage("hi")]);
    const harness = await Harness.open(
      new MemoryStorage(),
      { models, registry: createRegistry() },
      BACKGROUND_CONTEXT
    );
    try {
      const root = await harness.root(BACKGROUND_CONTEXT);
      await root.configure(
        { model: { provider: "faux", modelId: faux.getModel().id } },
        BACKGROUND_CONTEXT
      );
      expect(harness.wake().active).toBe(false);
      const submission = await root.submit({ type: "input", content: "hello" }, BACKGROUND_CONTEXT);
      expect(harness.wake().active).toBe(true);
      await harness.waitForIdle(BACKGROUND_CONTEXT);
      expect((await submission.status(BACKGROUND_CONTEXT)).status).toBe("done");
    } finally {
      await harness.close(BACKGROUND_CONTEXT);
    }
  });

  test("whenBusy reject refuses a concurrent submit", async () => {
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    // One response: the first run consumes it and ends; the point is the
    // second submit is rejected while the first is still placed.
    faux.setResponses([fauxAssistantMessage("one")]);
    const harness = await Harness.open(
      new MemoryStorage(),
      { models, registry: createRegistry() },
      BACKGROUND_CONTEXT
    );
    try {
      const root = await harness.root(BACKGROUND_CONTEXT);
      await root.configure(
        { model: { provider: "faux", modelId: faux.getModel().id } },
        BACKGROUND_CONTEXT
      );
      await root.submit({ type: "input", content: "first" }, BACKGROUND_CONTEXT);
      let busy: unknown;
      try {
        await root.submit({ type: "input", content: "second", whenBusy: "reject" }, BACKGROUND_CONTEXT);
      } catch (error) {
        busy = error;
      }
      expect(busy).toBeInstanceOf(ConversationBusy);
      await harness.waitForIdle(BACKGROUND_CONTEXT);
    } finally {
      await harness.close(BACKGROUND_CONTEXT);
    }
  });
});
