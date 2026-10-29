import { describe, expect, test } from "bun:test";

import type { Message } from "@earendil-works/pi-ai";

import { extractLastUserText, renderMessages, truncateText } from "../src/transcript";

const conversation: Message[] = [
  { role: "user", content: "Fix the failing test", timestamp: Date.now() },
  {
    role: "assistant",
    content: [
      { type: "toolCall", id: "1", name: "exec", arguments: { command: "bun test" } },
      { type: "text", text: "Running the suite." },
    ],
    api: "faux",
    provider: "faux",
    model: "faux-1",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  },
  {
    role: "toolResult",
    toolCallId: "1",
    toolName: "exec",
    content: [{ type: "text", text: "3 pass" }],
    isError: false,
    timestamp: Date.now(),
  },
];

describe("renderMessages", () => {
  test("renders users, assistant text, tool calls, and results", () => {
    const text = renderMessages(conversation);
    expect(text).toContain("user: Fix the failing test");
    expect(text).toContain('tool: exec({"command":"bun test"})');
    expect(text).toContain("assistant: Running the suite.");
    expect(text).toContain("result(exec): 3 pass");
  });

  test("skips system messages and blank text", () => {
    expect(renderMessages([])).toBe("");
  });
});

describe("extractLastUserText", () => {
  test("finds the newest user text", () => {
    expect(extractLastUserText(conversation)).toBe("Fix the failing test");
    expect(extractLastUserText([])).toBeUndefined();
  });
});

describe("truncateText", () => {
  test("passes short text through and marks cuts", () => {
    expect(truncateText("hi", 10)).toBe("hi");
    const cut = truncateText("x".repeat(100), 10);
    expect(cut.length).toBeLessThan(100);
    expect(cut).toContain("truncated");
  });
});
