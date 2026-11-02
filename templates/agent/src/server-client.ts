/**
 * `AgentServerClient` over a Void sandbox (`void/sandbox`): the DO reaches
 * the container-mode agent server with `sandbox.fetch(port, request)` and
 * starts it with `sandbox.exec(['node', '/opt/agent/server.mjs'])`. The
 * server bundle ships in the image (Dockerfile COPY), so — unlike the old
 * SDK flow — there is nothing to write and no named process to kill; a
 * best-effort `pkill` clears a half-dead server before a restart.
 *
 * The client is injected (structurally satisfied by the real sandbox
 * client) so tests drive it with fakes; this module never imports `void/*`
 * and loads under bun.
 */

import { PumpError, type AgentServerClient } from "./container-pump";
import { describeContainerError } from "./errors";
import {
  AGENT_SERVER_PATH,
  AGENT_SERVER_PORT,
  parseEventsResponse,
  type EventsResponse,
  type ModelAnswer,
} from "./protocol";
import { truncateText } from "./transcript";

/** Minimal sandbox surface the agent-server client needs. */
export interface AgentServerSandbox {
  run(argv: string[], options?: { signal?: AbortSignal }): Promise<{
    stdout: ArrayBuffer;
    stderr: ArrayBuffer;
    exitCode: number;
  }>;
  exec(argv: string[], options?: { stdout?: "ignore"; stderr?: "ignore" }): Promise<unknown>;
  fetch(port: number, request: Request): Promise<Response>;
}

export interface AgentServerClientOptions {
  /** Wall-clock sleep for the readiness wait; default real timers. Tests
   * inject an immediate fake (no wall-clock waits in tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Clock for the readiness deadline; default Date.now. Tests inject a
   * fake advanced by the fake sleep. */
  now?: () => number;
}

const PROBE_TIMEOUT_MS = 5_000;
const SUBMIT_TIMEOUT_MS = 30_000;
const ANSWER_TIMEOUT_MS = 15_000;
const ABORT_TIMEOUT_MS = 10_000;
/** Readiness wait after a (re)start, in 1 s probe steps. */
const START_TIMEOUT_MS = 60_000;
const START_PROBE_STEP_MS = 1_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reject when `promise` outlives `ms`; clears the timer on settle. */
async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/** Build the container-mode server client, bound to one sandbox. */
export function createAgentServerClient(
  sandbox: AgentServerSandbox,
  options: AgentServerClientOptions = {}
): AgentServerClient {
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;

  // The URL host is a placeholder: `sandbox.fetch` forwards by the port
  // argument to the container's loopback; only path/query/method/headers/
  // body cross into the container.
  async function serverFetch(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const request = new Request(`http://127.0.0.1:${AGENT_SERVER_PORT}${path}`, init);
    return withTimeout(
      sandbox.fetch(AGENT_SERVER_PORT, request),
      timeoutMs,
      `container server did not answer ${path} within ${timeoutMs} ms`
    );
  }

  async function probe(): Promise<boolean> {
    try {
      const res = await serverFetch("/health", { method: "GET" }, PROBE_TIMEOUT_MS);
      return res.ok;
    } catch {
      return false;
    }
  }

  async function ensureUp(): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (await probe()) {
        return;
      }
    }
    // A half-dead server (alive, not responding) would hold the port and
    // fail the fresh start with EADDRINUSE; clearing it is best-effort
    // (the image may not ship pkill). Killing a healthy server here is
    // harmless because the pump fails the task on the boot-id change
    // anyway.
    try {
      await sandbox.run(["pkill", "-f", AGENT_SERVER_PATH]);
    } catch {
      // Best-effort only.
    }
    try {
      // The bundle ships in the image; outputs are ignored so an unread
      // pipe can never stall the long-lived server.
      await sandbox.exec(["node", AGENT_SERVER_PATH], { stdout: "ignore", stderr: "ignore" });
    } catch (error) {
      const described = describeContainerError(error);
      throw new PumpError("server_start_failed", `${described.code}: ${described.message}`);
    }
    const started = now();
    for (;;) {
      if (await probe()) {
        return;
      }
      if (now() - started >= START_TIMEOUT_MS) {
        throw new PumpError(
          "server_start_failed",
          "container server did not become ready within 60 s"
        );
      }
      await sleep(START_PROBE_STEP_MS);
    }
  }

  async function submit(text: string): Promise<{ bootId: string }> {
    let res: Response;
    try {
      res = await serverFetch(
        "/tasks",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        },
        SUBMIT_TIMEOUT_MS
      );
    } catch (error) {
      throw new PumpError("submit_failed", error instanceof Error ? error.message : String(error));
    }
    if (res.status === 409) {
      throw new PumpError("server_busy", "container server is already running a task");
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new PumpError("submit_failed", `task submission failed (status ${res.status}): ${truncateText(body, 500)}`);
    }
    const json = (await res.json().catch(() => undefined)) as { bootId?: unknown } | undefined;
    if (typeof json?.bootId !== "string" || json.bootId === "") {
      throw new PumpError("submit_failed", "container server answered without a boot id");
    }
    return { bootId: json.bootId };
  }

  async function events(after: number, waitSeconds: number): Promise<EventsResponse> {
    let res: Response;
    try {
      res = await serverFetch(`/events?after=${after}&wait=${waitSeconds}`, { method: "GET" }, (waitSeconds + 10) * 1000);
    } catch (error) {
      throw new PumpError("unreachable", error instanceof Error ? error.message : String(error));
    }
    if (!res.ok) {
      throw new PumpError("unreachable", `events poll failed (status ${res.status})`);
    }
    const json = await res.json().catch(() => undefined);
    const parsed = parseEventsResponse(json);
    if (!parsed.ok) {
      throw new PumpError("bad_response", `container server sent a bad events batch: ${parsed.message}`);
    }
    return parsed.value;
  }

  async function answer(id: string, modelAnswer: ModelAnswer): Promise<"ok" | "unknown"> {
    let res: Response;
    try {
      res = await serverFetch(
        `/model/${id}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(modelAnswer),
        },
        ANSWER_TIMEOUT_MS
      );
    } catch (error) {
      throw new PumpError("answer_failed", error instanceof Error ? error.message : String(error));
    }
    if (res.status === 404) {
      return "unknown";
    }
    if (!res.ok) {
      throw new PumpError("answer_failed", `model answer failed (status ${res.status})`);
    }
    return "ok";
  }

  async function abort(): Promise<void> {
    try {
      await serverFetch("/tasks", { method: "DELETE" }, ABORT_TIMEOUT_MS);
    } catch {
      // Best-effort only.
    }
  }

  return { ensureUp, submit, events, answer, abort };
}
