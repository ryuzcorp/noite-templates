/**
 * Wire protocol between the DO (Worker side) and the agent server (container
 * side). Shared by both ends so they cannot drift; validation is strict on
 * input, lenient on output defaults. Pure: unit-tested.
 */

import type { AssistantMessage, Message } from "@earendil-works/pi-ai";

/** Port the agent server listens on inside the container. */
export const AGENT_SERVER_PORT = 8787;

/** Where the DO writes the bundled server before starting it. */
export const AGENT_SERVER_PATH = "/workspace/.agent/agent-server.mjs";

/** Fixed process id so a restart finds (and replaces) the old server. */
export const AGENT_SERVER_PROCESS_ID = "agent-server";

/** Ephemeral harness storage inside the container (lost on recycle). */
export const AGENT_STATE_DIR = "/workspace/.agent";

export const MAX_LONG_POLL_SECONDS = 20;
export const MAX_TASK_CHARS = 20_000;

export type RunStatus = "idle" | "running" | "done" | "failed";

export interface RunState {
  status: RunStatus;
  error?: string;
}

/** One model call the server needs the DO to run with the real API key. */
export interface ModelRequestPayload {
  id: string;
  /** Normalized transcript: tools are already folded into system messages,
   * so the DO replays it with `completeSimple({messages})` verbatim. */
  messages: Message[];
  options: ModelRequestOptions;
}

export interface ModelRequestOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface TranscriptEvent {
  seq: number;
  kind: "transcript";
  text: string;
}

export interface EventsResponse {
  cursor: number;
  /** Random per server boot; a change means the container was recycled. */
  bootId: string;
  run: RunState;
  /** Every currently pending model request (state, not events: the DO
   * answers each by id, and unanswered ones are re-presented). */
  pendingRequests: ModelRequestPayload[];
  events: TranscriptEvent[];
}

export type ModelAnswer = { message: AssistantMessage } | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRunState(value: unknown): value is RunState {
  if (!isRecord(value) || typeof value["status"] !== "string") {
    return false;
  }
  if (!["idle", "running", "done", "failed"].includes(value["status"])) {
    return false;
  }
  return value["error"] === undefined || typeof value["error"] === "string";
}

function isModelRequest(value: unknown): value is ModelRequestPayload {
  if (!isRecord(value) || typeof value["id"] !== "string" || value["id"] === "") {
    return false;
  }
  if (!Array.isArray(value["messages"])) {
    return false;
  }
  const options = value["options"];
  if (options !== undefined && !isRecord(options)) {
    return false;
  }
  if (isRecord(options)) {
    const temperature = options["temperature"];
    const maxTokens = options["maxTokens"];
    if (temperature !== undefined && typeof temperature !== "number") {
      return false;
    }
    if (maxTokens !== undefined && typeof maxTokens !== "number") {
      return false;
    }
  }
  return true;
}

function isTranscriptEvent(value: unknown): value is TranscriptEvent {
  return (
    isRecord(value) &&
    typeof value["seq"] === "number" &&
    value["kind"] === "transcript" &&
    typeof value["text"] === "string"
  );
}

export type ParsedEvents = { ok: true; value: EventsResponse } | { ok: false; message: string };

/** Strictly validate a GET /events body from the container server. */
export function parseEventsResponse(json: unknown): ParsedEvents {
  if (!isRecord(json)) {
    return { ok: false, message: "events response is not an object" };
  }
  if (typeof json["cursor"] !== "number" || typeof json["bootId"] !== "string" || json["bootId"] === "") {
    return { ok: false, message: "events response has a bad cursor or bootId" };
  }
  if (!isRunState(json["run"])) {
    return { ok: false, message: "events response has a bad run state" };
  }
  if (!Array.isArray(json["pendingRequests"]) || !json["pendingRequests"].every(isModelRequest)) {
    return { ok: false, message: "events response has bad pendingRequests" };
  }
  if (!Array.isArray(json["events"]) || !json["events"].every(isTranscriptEvent)) {
    return { ok: false, message: "events response has bad events" };
  }
  return {
    ok: true,
    value: {
      cursor: json["cursor"],
      bootId: json["bootId"],
      run: json["run"],
      pendingRequests: json["pendingRequests"].map((request) => ({
        id: request.id,
        messages: request.messages as Message[],
        options: {
          ...(typeof request.options?.temperature === "number"
            ? { temperature: request.options.temperature }
            : {}),
          ...(typeof request.options?.maxTokens === "number" ? { maxTokens: request.options.maxTokens } : {}),
        },
      })),
      events: json["events"],
    },
  };
}

export type ParsedTask = { ok: true; text: string } | { ok: false; message: string };

/** Validate a POST /tasks body (server side). */
export function parseTaskBody(json: unknown): ParsedTask {
  if (!isRecord(json) || typeof json["text"] !== "string") {
    return { ok: false, message: "task text is required" };
  }
  const text = json["text"].trim();
  if (text === "" || text.length > MAX_TASK_CHARS) {
    return { ok: false, message: `task text is required (max ${MAX_TASK_CHARS} chars)` };
  }
  return { ok: true, text };
}

export type ParsedAnswer = { ok: true; value: ModelAnswer } | { ok: false; message: string };

/**
 * Validate a POST /model/<id> body (server side). A message needs only
 * role + content + stopReason; the broker fills usage/timing defaults for
 * whatever the DO omitted.
 */
export function parseModelAnswer(json: unknown): ParsedAnswer {
  if (!isRecord(json)) {
    return { ok: false, message: "model answer is not an object" };
  }
  if (typeof json["error"] === "string" && json["error"] !== "") {
    return { ok: true, value: { error: json["error"] } };
  }
  const message = json["message"];
  if (!isRecord(message) || message["role"] !== "assistant" || !Array.isArray(message["content"])) {
    return { ok: false, message: "model answer needs {message} or {error}" };
  }
  if (typeof message["stopReason"] !== "string") {
    return { ok: false, message: "model answer message needs a stopReason" };
  }
  return { ok: true, value: { message: message as unknown as AssistantMessage } };
}

/** Clamp a ?wait= query value to the 0..20 s the protocol allows. */
export function clampLongPollSeconds(raw: string | null): number {
  if (raw === null) {
    return 0;
  }
  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) {
    return 0;
  }
  return Math.max(0, Math.min(MAX_LONG_POLL_SECONDS, Math.floor(seconds)));
}

/** Parse a ?after= cursor, defaulting to 0 on garbage. */
export function parseAfterCursor(raw: string | null): number {
  if (raw === null) {
    return 0;
  }
  const cursor = Number(raw);
  if (!Number.isFinite(cursor) || cursor < 0) {
    return 0;
  }
  return Math.floor(cursor);
}
