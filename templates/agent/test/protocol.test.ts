import { describe, expect, test } from "bun:test";

import { fauxAssistantMessage } from "@earendil-works/pi-ai";

import {
  clampLongPollSeconds,
  parseAfterCursor,
  parseEventsResponse,
  parseModelAnswer,
  parseTaskBody,
} from "../src/protocol";

describe("parseEventsResponse", () => {
  const valid = {
    cursor: 7,
    bootId: "boot-1",
    run: { status: "running" },
    pendingRequests: [
      { id: "mr-1", messages: [{ role: "user", content: "hi", timestamp: 1 }], options: {} },
    ],
    events: [{ seq: 7, kind: "transcript", text: "hello" }],
  };

  test("accepts a well-formed response", () => {
    const parsed = parseEventsResponse(valid);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.cursor).toBe(7);
      expect(parsed.value.pendingRequests).toHaveLength(1);
    }
  });

  test("rejects malformed responses", () => {
    expect(parseEventsResponse(null).ok).toBe(false);
    expect(parseEventsResponse({ ...valid, bootId: "" }).ok).toBe(false);
    expect(parseEventsResponse({ ...valid, run: { status: "exploding" } }).ok).toBe(false);
    expect(parseEventsResponse({ ...valid, pendingRequests: [{ id: "", messages: [] }] }).ok).toBe(
      false
    );
    expect(parseEventsResponse({ ...valid, events: [{ seq: "7" }] }).ok).toBe(false);
  });
});

describe("parseTaskBody", () => {
  test("requires non-empty bounded text", () => {
    expect(parseTaskBody({ text: "  do it " })).toEqual({ ok: true, text: "do it" });
    expect(parseTaskBody({}).ok).toBe(false);
    expect(parseTaskBody({ text: "   " }).ok).toBe(false);
    expect(parseTaskBody({ text: "x".repeat(20_001) }).ok).toBe(false);
  });
});

describe("parseModelAnswer", () => {
  test("accepts a message or an error", () => {
    const message = fauxAssistantMessage("done");
    expect(parseModelAnswer({ message })).toMatchObject({ ok: true });
    expect(parseModelAnswer({ error: "key revoked" })).toEqual({
      ok: true,
      value: { error: "key revoked" },
    });
    expect(parseModelAnswer({}).ok).toBe(false);
    expect(parseModelAnswer({ message: { role: "user", content: [] } }).ok).toBe(false);
    expect(parseModelAnswer({ message: { role: "assistant", content: [] } }).ok).toBe(false);
    expect(parseModelAnswer({ error: "" }).ok).toBe(false);
  });
});

describe("query parsing", () => {
  test("clamps long-poll seconds to 0..20", () => {
    expect(clampLongPollSeconds(null)).toBe(0);
    expect(clampLongPollSeconds("5")).toBe(5);
    expect(clampLongPollSeconds("99")).toBe(20);
    expect(clampLongPollSeconds("-3")).toBe(0);
    expect(clampLongPollSeconds("soon").valueOf()).toBe(0);
  });

  test("parses the after cursor defensively", () => {
    expect(parseAfterCursor(null)).toBe(0);
    expect(parseAfterCursor("12")).toBe(12);
    expect(parseAfterCursor("-2")).toBe(0);
    expect(parseAfterCursor("later")).toBe(0);
  });
});
