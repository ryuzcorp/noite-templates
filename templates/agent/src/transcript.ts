import type { Message } from "@earendil-works/pi-ai";

/** Plain-text rendering of a harness transcript. Pure: unit-tested. */

const MAX_CONTEXT_CHARS = 8000;

/** Render one message's content blocks to text; image blocks become a marker. */
function contentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of content as Array<{ type?: unknown; text?: unknown }>) {
    if (typeof block !== "object" || block === null) {
      continue;
    }
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    } else if (block.type === "image") {
      parts.push("[image]");
    }
  }
  return parts.join("\n");
}

/** Render model messages (EntryRecord.model) as "role: text" lines. */
export function renderMessages(messages: readonly Message[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    if (message.role === "system") {
      continue;
    }
    if (message.role === "user") {
      const text = contentText(message.content).trim();
      if (text !== "") {
        lines.push(`user: ${text}`);
      }
    } else if (message.role === "assistant") {
      for (const block of message.content) {
        if (block.type === "text") {
          const text = block.text.trim();
          if (text !== "") {
            lines.push(`assistant: ${text}`);
          }
        } else if (block.type === "toolCall") {
          lines.push(`tool: ${block.name}(${JSON.stringify(block.arguments)})`);
        }
      }
    } else if (message.role === "toolResult") {
      const text = contentText(message.content).trim();
      lines.push(`result(${message.toolName}): ${text}`);
    }
  }
  return lines.join("\n");
}

/** Bound container/exec output so one huge file cannot flood the transcript. */
export function truncateText(text: string, maxChars: number = MAX_CONTEXT_CHARS): string {
  if (text.length <= maxChars) {
    return text;
  }
  const kept = text.slice(0, maxChars);
  return `${kept}\n… [truncated ${text.length - maxChars} chars]`;
}

/** Text of the newest user message, if any. Used for faux-mode echoes. */
export function extractLastUserText(messages: readonly Message[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message === undefined || message.role !== "user") {
      continue;
    }
    const text = contentText(message.content).trim();
    if (text !== "") {
      return text;
    }
  }
  return undefined;
}
