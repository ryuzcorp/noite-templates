import { describe, expect, test } from "bun:test";

import {
  createModels,
  fauxAssistantMessage,
  fauxToolCall,
  normalizeContext,
  type AssistantMessageEvent,
} from "@earendil-works/pi-ai";
import { obj } from "@earendil-works/pi-schema";

import { BROKER_MODEL_ID, BROKER_PROVIDER, createBrokerProvider } from "../src/broker";

async function collect(stream: AsyncIterable<AssistantMessageEvent>): Promise<AssistantMessageEvent[]> {
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe("broker provider", () => {
  test("advertises one broker model", () => {
    const broker = createBrokerProvider();
    expect(broker.id).toBe(BROKER_PROVIDER);
    expect(broker.getModels().map((model) => model.id)).toEqual([BROKER_MODEL_ID]);
    expect(broker.pendingRequests()).toEqual([]);
  });

  test("a model call becomes a pending request carrying the normalized context", () => {
    const seen: number[] = [];
    const broker = createBrokerProvider({ onChange: () => seen.push(broker.pendingRequests().length) });
    const model = broker.getModels()[0]!;
    const context = normalizeContext({
      systemPrompt: "be brief",
      messages: [{ role: "user", content: "hi", timestamp: 1 }],
      tools: [{ name: "bash", description: "run", parameters: obj({}) }],
    });
    const stream = broker.streamSimple(model, context, { temperature: 0.5, maxTokens: 99 });
    expect(stream).toBeDefined();
    const pending = broker.pendingRequests();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe("mr-1");
    expect(pending[0]?.options).toEqual({ temperature: 0.5, maxTokens: 99 });
    // Tools are folded into the leading system message: the DO replays as-is.
    expect(pending[0]?.messages[0]?.role).toBe("system");
    expect(JSON.stringify(pending[0]?.messages)).toContain("bash");
    expect(seen).toEqual([1]);
  });

  test("round trip: the fake DO answers and the caller gets the message", async () => {
    const broker = createBrokerProvider();
    const model = broker.getModels()[0]!;
    const context = normalizeContext({ messages: [{ role: "user", content: "hi", timestamp: 1 }] });
    const stream = broker.streamSimple(model, context, undefined);
    const result = stream.result();
    const [request] = broker.pendingRequests();
    expect(request?.id).toBe("mr-1");
    // The answer crosses JSON (HTTP): round-trip it like the wire would.
    const answer = fauxAssistantMessage("hello from the DO");
    const revived = JSON.parse(JSON.stringify(answer)) as typeof answer;
    expect(broker.resolveRequest(request!.id, revived)).toBe(true);
    expect(broker.pendingRequests()).toEqual([]);
    const message = await result;
    expect(message.content).toEqual(revived.content);
    expect(message.stopReason).toBe("stop");
    // Unknown and double settles are rejected.
    expect(broker.resolveRequest("mr-999", revived)).toBe(false);
    expect(broker.resolveRequest(request!.id, revived)).toBe(false);
  });

  test("tool calls survive the round trip with their stop reason", async () => {
    const broker = createBrokerProvider();
    const model = broker.getModels()[0]!;
    const context = normalizeContext({ messages: [{ role: "user", content: "run it", timestamp: 1 }] });
    const stream = broker.streamSimple(model, context, undefined);
    const events = collect(stream);
    const [request] = broker.pendingRequests();
    const answer = fauxAssistantMessage([fauxToolCall("bash", { command: "echo hi" })], {
      stopReason: "toolUse",
    });
    broker.resolveRequest(request!.id, JSON.parse(JSON.stringify(answer)) as typeof answer);
    const kinds = (await events).map((event) => event.type);
    expect(kinds[0]).toBe("start");
    expect(kinds[kinds.length - 1]).toBe("done");
    const message = await stream.result();
    expect(message.stopReason).toBe("toolUse");
  });

  test("rejection surfaces the DO error to the caller", async () => {
    const broker = createBrokerProvider();
    const model = broker.getModels()[0]!;
    const context = normalizeContext({ messages: [{ role: "user", content: "hi", timestamp: 1 }] });
    const stream = broker.streamSimple(model, context, undefined);
    const events = collect(stream);
    const [request] = broker.pendingRequests();
    expect(broker.rejectRequest(request!.id, "key revoked")).toBe(true);
    expect(broker.rejectRequest(request!.id, "again")).toBe(false);
    const terminal = (await events).at(-1);
    expect(terminal?.type).toBe("error");
    if (terminal?.type === "error") {
      expect(terminal.error.errorMessage).toBe("key revoked");
    }
    expect((await stream.result()).stopReason).toBe("error");
  });

  test("an aborted signal fails the pending request", async () => {
    const broker = createBrokerProvider();
    const model = broker.getModels()[0]!;
    const controller = new AbortController();
    const context = normalizeContext({ messages: [{ role: "user", content: "hi", timestamp: 1 }] });
    const stream = broker.streamSimple(model, context, { signal: controller.signal });
    expect(broker.pendingRequests()).toHaveLength(1);
    controller.abort();
    expect(broker.pendingRequests()).toEqual([]);
    expect((await stream.result()).stopReason).toBe("error");
  });

  test("works through a Models collection end to end", async () => {
    const broker = createBrokerProvider();
    const models = createModels();
    models.setProvider(broker);
    const model = models.getModel(BROKER_PROVIDER, BROKER_MODEL_ID)!;
    const pending = models.completeSimple(
      model,
      { messages: [{ role: "user", content: "hi", timestamp: 1 }] },
      undefined
    );
    // Models resolves auth on a microtask before reaching the provider.
    for (let i = 0; i < 10 && broker.pendingRequests().length === 0; i++) {
      await Promise.resolve();
    }
    const [request] = broker.pendingRequests();
    expect(request?.id).toBe("mr-1");
    broker.resolveRequest(request!.id, fauxAssistantMessage("via models"));
    const message = await pending;
    expect(JSON.stringify(message)).toContain("via models");
  });
});
