/**
 * DO-side pump for container mode (`AGENT_RUNTIME=container`). One iteration:
 * make sure the agent server is up, submit the task text once, long-poll one
 * event batch, mirror transcript events into DO storage, and answer pending
 * model requests with the real provider (the key never enters the container).
 * All side effects go through injected dependencies so the policy —
 * recycle detection, fail-fast on misconfiguration, bounded retries — is
 * unit-testable with fakes. No timers, no sleeps.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";

import type { EventsResponse, ModelAnswer, ModelRequestPayload } from "./protocol";

export type ContainerTaskStatus = "idle" | "starting" | "running" | "done" | "failed";

export interface ContainerTaskRecord {
  status: ContainerTaskStatus;
  /** Task text until it is submitted to the server, then cleared. */
  text?: string;
  /** Events cursor last mirrored. */
  cursor: number;
  /** Server boot id the run was submitted to; a change means recycle. */
  bootId?: string;
  /** Consecutive failed event polls (reset on success). */
  failures: number;
  /** Consecutive unexpected pump crashes (the DO alarm wrapper counts). */
  pumpRetries?: number;
  error?: string;
  updatedAt: number;
}

/** Long-poll wait per pump iteration (protocol max is 20). */
export const PUMP_POLL_SECONDS = 20;

/** Failed polls before the pump gives up on a running task. */
export const PUMP_MAX_FAILURES = 3;

/** Typed client failure; anything else propagates as a bug. */
export class PumpError extends Error {
  readonly code:
    | "server_start_failed"
    | "server_busy"
    | "submit_failed"
    | "unreachable"
    | "bad_response"
    | "answer_failed";

  constructor(
    code: PumpError["code"],
    message: string
  ) {
    super(message);
    this.name = "PumpError";
    this.code = code;
  }
}

/** The container server, reached over DO→container HTTP. */
export interface AgentServerClient {
  /** Probe /health; write + start + wait for the server when it is down. */
  ensureUp(): Promise<void>;
  /** Submit task text; the server runs one task at a time. */
  submit(text: string): Promise<{ bootId: string }>;
  /** One long-poll batch. */
  events(after: number, waitSeconds: number): Promise<EventsResponse>;
  /** Answer one model request; `unknown` if it already settled. */
  answer(id: string, answer: ModelAnswer): Promise<"ok" | "unknown">;
  /** Best-effort abort of the server-side run; never throws. */
  abort(): Promise<void>;
}

export interface PumpStore {
  loadTask(): Promise<ContainerTaskRecord | null>;
  saveTask(task: ContainerTaskRecord): Promise<void>;
  appendMirror(text: string): Promise<void>;
}

export type ModelAnswerOutcome =
  | { kind: "message"; message: AssistantMessage }
  | { kind: "error"; error: string }
  /** No model is configured: fail fast instead of stalling the server run. */
  | { kind: "misconfigured"; message: string };

export interface PumpModel {
  answer(request: ModelRequestPayload): Promise<ModelAnswerOutcome>;
}

export type PumpOutcome = { action: "continue" } | { action: "stop" };

export interface PumpDeps {
  now: () => number;
  client: AgentServerClient;
  store: PumpStore;
  model: PumpModel;
}

function failed(now: number, task: ContainerTaskRecord, error: string): ContainerTaskRecord {
  return { ...task, status: "failed", text: undefined, error, updatedAt: now };
}

/**
 * Run one pump iteration. Returns `continue` when the caller should re-arm
 * the pump (another iteration immediately); `stop` when the task settled or
 * there is nothing to do.
 */
export async function pumpAgentOnce(deps: PumpDeps): Promise<PumpOutcome> {
  const { now, client, store, model } = deps;
  const task = await store.loadTask();
  if (task === null || task.status === "idle" || task.status === "done" || task.status === "failed") {
    return { action: "stop" };
  }

  try {
    await client.ensureUp();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const message =
      task.status === "running"
        ? `container was lost during the run and the agent server could not be restarted: ${detail}`
        : `agent server did not start: ${detail}`;
    await store.saveTask(failed(now(), task, message));
    return { action: "stop" };
  }

  let current = task;
  if (current.status === "starting") {
    const text = current.text ?? "";
    if (text === "") {
      await store.saveTask(failed(now(), current, "task text was lost before it reached the container"));
      return { action: "stop" };
    }
    try {
      const submitted = await client.submit(text);
      current = { ...current, status: "running", text: undefined, bootId: submitted.bootId, updatedAt: now() };
      await store.saveTask(current);
    } catch (error) {
      if (error instanceof PumpError && error.code === "server_busy") {
        // A run the DO no longer tracks (e.g. storage was wiped). Reclaim
        // the server, then fail this task so the operator resubmits.
        await client.abort();
        await store.saveTask(
          failed(now(), current, "container server was busy with an untracked run; aborted it, resubmit the task")
        );
        return { action: "stop" };
      }
      const detail = error instanceof Error ? error.message : String(error);
      await store.saveTask(failed(now(), current, `task submission to the container failed: ${detail}`));
      return { action: "stop" };
    }
  }

  let batch: EventsResponse;
  try {
    batch = await client.events(current.cursor, PUMP_POLL_SECONDS);
  } catch (error) {
    const failures = current.failures + 1;
    if (failures >= PUMP_MAX_FAILURES) {
      const detail = error instanceof Error ? error.message : String(error);
      await client.abort();
      await store.saveTask(
        failed(now(), { ...current, failures }, `lost contact with the container (${failures} failed polls): ${detail}`)
      );
      return { action: "stop" };
    }
    await store.saveTask({ ...current, failures, updatedAt: now() });
    return { action: "continue" };
  }

  if (current.bootId === undefined || batch.bootId !== current.bootId) {
    // The server is new: the container (and its ephemeral harness state)
    // was recycled mid-run. The run cannot resume; fail loudly.
    await store.saveTask(
      failed(now(), current, "container was recycled during the run; the server-side run is gone, resubmit the task")
    );
    return { action: "stop" };
  }

  for (const event of batch.events) {
    await store.appendMirror(event.text);
  }
  current = { ...current, cursor: batch.cursor, failures: 0, updatedAt: now() };
  await store.saveTask(current);

  for (const request of batch.pendingRequests) {
    const outcome = await model.answer(request);
    if (outcome.kind === "misconfigured") {
      await client.abort();
      await store.saveTask(failed(now(), current, outcome.message));
      return { action: "stop" };
    }
    const answer: ModelAnswer =
      outcome.kind === "message" ? { message: outcome.message } : { error: outcome.error };
    try {
      await client.answer(request.id, answer);
    } catch {
      // The answer may not have landed; the server re-presents unanswered
      // requests on the next poll. Stop here (later requests stay queued)
      // and continue on the next iteration.
      return { action: "continue" };
    }
  }

  if (batch.run.status === "done") {
    await store.saveTask({ ...current, status: "done", error: undefined, updatedAt: now() });
    return { action: "stop" };
  }
  if (batch.run.status === "failed") {
    await store.saveTask(failed(now(), current, batch.run.error ?? "container run failed"));
    return { action: "stop" };
  }
  return { action: "continue" };
}
