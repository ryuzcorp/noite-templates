/**
 * Broker pi-ai provider (container side): each model call becomes a pending
 * request the DO answers over HTTP, so the model API key never enters the
 * container. The pending request carries the already-normalized transcript
 * (tools folded into system messages), which the DO replays verbatim with
 * `completeSimple({messages})`. Pure orchestration: unit-tested.
 */

import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Message,
  type Model,
  type Provider,
  type StreamOptions,
  type TranscriptContext,
} from "@earendil-works/pi-ai";

import type { ModelRequestOptions, ModelRequestPayload } from "./protocol";

export const BROKER_PROVIDER = "broker" as const;
export const BROKER_API = "broker" as const;
export const BROKER_MODEL_ID = "broker-1" as const;

export interface BrokerHooks {
  /** Current epoch ms; default Date.now. */
  now?: () => number;
  /** Called whenever the pending set changes (request added or settled). */
  onChange?: () => void;
}

interface PendingEntry {
  request: ModelRequestPayload;
  stream: AssistantMessageEventStream;
  onAbort: () => void;
  signal?: AbortSignal;
}

export interface BrokerProvider extends Provider {
  /** Snapshot of currently unanswered requests, for GET /events. */
  pendingRequests(): ModelRequestPayload[];
  /**
   * Answer a request with the DO's model message. Returns false for an
   * unknown (or already settled) id.
   */
  resolveRequest(id: string, message: AssistantMessage): boolean;
  /** Fail a request with the DO's error text. Same unknown-id contract. */
  rejectRequest(id: string, error: string): boolean;
}

function extractOptions(options: StreamOptions | undefined): ModelRequestOptions {
  if (options === undefined) {
    return {};
  }
  // Only data fields cross the HTTP boundary; callbacks (onResponse, …)
  // and signals stay container-side.
  return {
    ...(typeof options.temperature === "number" ? { temperature: options.temperature } : {}),
    ...(typeof options.maxTokens === "number" ? { maxTokens: options.maxTokens } : {}),
  };
}

function zeroUsage(): AssistantMessage["usage"] {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

/**
 * Create the broker provider. One instance serves one server: request ids
 * are a per-boot counter, and a boot id distinguishes servers across
 * container recycles.
 */
export function createBrokerProvider(hooks: BrokerHooks = {}): BrokerProvider {
  const now = hooks.now ?? Date.now;
  const onChange = hooks.onChange;
  let counter = 0;
  const pending = new Map<string, PendingEntry>();

  const model: Model<typeof BROKER_API> = {
    id: BROKER_MODEL_ID,
    name: "broker",
    api: BROKER_API,
    provider: BROKER_PROVIDER,
    baseUrl: "http://broker.local",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_384,
  };

  function finish(id: string, entry: PendingEntry): void {
    pending.delete(id);
    entry.signal?.removeEventListener("abort", entry.onAbort);
    onChange?.();
  }

  function request(
    context: TranscriptContext,
    options: StreamOptions | undefined
  ): AssistantMessageEventStream {
    counter += 1;
    const id = `mr-${counter}`;
    const stream = createAssistantMessageEventStream();
    const messages: Message[] = [...context.messages];
    const payload: ModelRequestPayload = { id, messages, options: extractOptions(options) };
    const entry: PendingEntry = {
      request: payload,
      stream,
      onAbort: () => {
        rejectRequest(id, "model request was aborted");
      },
      ...(options?.signal === undefined ? {} : { signal: options.signal }),
    };
    pending.set(id, entry);
    if (entry.signal !== undefined) {
      if (entry.signal.aborted) {
        entry.onAbort();
      } else {
        entry.signal.addEventListener("abort", entry.onAbort, { once: true });
      }
    }
    onChange?.();
    return stream;
  }

  function resolveRequest(id: string, message: AssistantMessage): boolean {
    const entry = pending.get(id);
    if (entry === undefined) {
      return false;
    }
    const completed: AssistantMessage = {
      ...message,
      role: "assistant",
      api: message.api ?? BROKER_API,
      provider: message.provider ?? BROKER_PROVIDER,
      model: message.model ?? BROKER_MODEL_ID,
      usage: message.usage ?? zeroUsage(),
      timestamp: message.timestamp ?? now(),
    };
    if (completed.stopReason === "error" || completed.stopReason === "aborted") {
      entry.stream.push({ type: "error", reason: completed.stopReason, error: completed });
      entry.stream.end(completed);
      finish(id, entry);
      return true;
    }
    const reason =
      completed.stopReason === "stop" ||
      completed.stopReason === "length" ||
      completed.stopReason === "toolUse" ||
      completed.stopReason === "deferred"
        ? completed.stopReason
        : "stop";
    const normalized: AssistantMessage = { ...completed, stopReason: reason };
    entry.stream.push({ type: "start", partial: normalized });
    entry.stream.push({ type: "done", reason, message: normalized });
    entry.stream.end(normalized);
    finish(id, entry);
    return true;
  }

  function rejectRequest(id: string, error: string): boolean {
    const entry = pending.get(id);
    if (entry === undefined) {
      return false;
    }
    const failed: AssistantMessage = {
      role: "assistant",
      content: [],
      api: BROKER_API,
      provider: BROKER_PROVIDER,
      model: BROKER_MODEL_ID,
      usage: zeroUsage(),
      stopReason: "error",
      errorMessage: error,
      timestamp: now(),
    };
    entry.stream.push({ type: "error", reason: "error", error: failed });
    entry.stream.end(failed);
    finish(id, entry);
    return true;
  }

  function pendingRequests(): ModelRequestPayload[] {
    return [...pending.values()].map((entry) => entry.request);
  }

  return {
    id: BROKER_PROVIDER,
    name: "Broker",
    auth: { apiKey: { name: "Broker", resolve: async () => ({ auth: {} }) } },
    getModels: () => [model],
    stream: (_model, context, options) => request(context, options),
    streamSimple: (_model, context, options) => request(context, options),
    pendingRequests,
    resolveRequest,
    rejectRequest,
  };
}
