import { describe, expect, test } from "bun:test";

import { fauxAssistantMessage } from "@earendil-works/pi-ai";

import {
  PumpError,
  pumpAgentOnce,
  type AgentServerClient,
  type ContainerTaskRecord,
  type ModelAnswerOutcome,
  type PumpDeps,
} from "../src/container-pump";
import type { EventsResponse, ModelAnswer, ModelRequestPayload } from "../src/protocol";

/** Fake container server with scripted behavior. */
class FakeServer implements AgentServerClient {
  ensureUpImpl: () => Promise<void> = async () => undefined;
  submitImpl: (text: string) => Promise<{ bootId: string }> = async () => ({ bootId: "boot-1" });
  eventsImpl: (after: number, waitSeconds: number) => Promise<EventsResponse> = async () => ({
    cursor: 0,
    bootId: "boot-1",
    run: { status: "running" },
    pendingRequests: [],
    events: [],
  });
  answers: Array<{ id: string; answer: ModelAnswer }> = [];
  answerImpl: (id: string, answer: ModelAnswer) => Promise<"ok" | "unknown"> = async (id, answer) => {
    this.answers.push({ id, answer });
    return "ok";
  };
  aborts = 0;

  async ensureUp(): Promise<void> {
    await this.ensureUpImpl();
  }
  async submit(text: string): Promise<{ bootId: string }> {
    return this.submitImpl(text);
  }
  async events(after: number, waitSeconds: number): Promise<EventsResponse> {
    return this.eventsImpl(after, waitSeconds);
  }
  async answer(id: string, answer: ModelAnswer): Promise<"ok" | "unknown"> {
    return this.answerImpl(id, answer);
  }
  async abort(): Promise<void> {
    this.aborts += 1;
  }
}

interface Harness {
  deps: PumpDeps;
  server: FakeServer;
  mirror: string[];
  saved: ContainerTaskRecord[];
  task: ContainerTaskRecord | null;
  answerImpl: (request: ModelRequestPayload) => Promise<ModelAnswerOutcome>;
}

function makeHarness(task: ContainerTaskRecord | null): Harness {
  const harness: Harness = {
    deps: undefined as unknown as PumpDeps,
    server: new FakeServer(),
    mirror: [],
    saved: [],
    task,
    answerImpl: async () => ({ kind: "message", message: fauxAssistantMessage("ok") }),
  };
  harness.deps = {
    now: () => 1_700_000_000_000,
    client: harness.server,
    store: {
      loadTask: async () => harness.task,
      saveTask: async (next) => {
        harness.task = next;
        harness.saved.push(next);
      },
      appendMirror: async (text) => {
        harness.mirror.push(text);
      },
    },
    model: { answer: (request) => harness.answerImpl(request) },
  };
  return harness;
}

const STARTING: ContainerTaskRecord = {
  status: "starting",
  text: "do it",
  cursor: 0,
  failures: 0,
  updatedAt: 0,
};

describe("pumpAgentOnce", () => {
  test("idle, settled, and missing tasks stop without touching the server", async () => {
    for (const task of [null, { ...STARTING, status: "idle" as const }, { ...STARTING, status: "done" as const }]) {
      const harness = makeHarness(task);
      let touched = false;
      harness.server.ensureUpImpl = async () => {
        touched = true;
      };
      expect(await pumpAgentOnce(harness.deps)).toEqual({ action: "stop" });
      expect(touched).toBe(false);
    }
  });

  test("submit → poll → answer → mirror → done", async () => {
    const harness = makeHarness({ ...STARTING });
    const seen: string[] = [];
    harness.server.submitImpl = async (text) => {
      seen.push(text);
      return { bootId: "boot-1" };
    };
    const request: ModelRequestPayload = { id: "mr-1", messages: [], options: {} };
    let polls = 0;
    harness.server.eventsImpl = async (after) => {
      polls += 1;
      expect(after).toBe(polls === 1 ? 0 : 2);
      return polls === 1
        ? {
            cursor: 2,
            bootId: "boot-1",
            run: { status: "running" },
            pendingRequests: [request],
            events: [
              { seq: 1, kind: "transcript", text: "user: do it" },
              { seq: 2, kind: "transcript", text: "assistant: working" },
            ],
          }
        : { cursor: 2, bootId: "boot-1", run: { status: "done" }, pendingRequests: [], events: [] };
    };
    expect(await pumpAgentOnce(harness.deps)).toEqual({ action: "continue" });
    expect(seen).toEqual(["do it"]);
    expect(harness.task?.status).toBe("running");
    expect(harness.task?.bootId).toBe("boot-1");
    expect(harness.task?.text).toBeUndefined();
    expect(harness.mirror).toEqual(["user: do it", "assistant: working"]);
    expect(harness.server.answers).toHaveLength(1);
    expect(harness.server.answers[0]?.id).toBe("mr-1");

    expect(await pumpAgentOnce(harness.deps)).toEqual({ action: "stop" });
    expect(harness.task?.status).toBe("done");
    expect(polls).toBe(2);
  });

  test("a recycled container fails the task loudly", async () => {
    const harness = makeHarness({ ...STARTING, status: "running", bootId: "boot-1", cursor: 4 });
    harness.server.eventsImpl = async () => ({
      cursor: 0,
      bootId: "boot-2",
      run: { status: "idle" },
      pendingRequests: [],
      events: [],
    });
    expect(await pumpAgentOnce(harness.deps)).toEqual({ action: "stop" });
    expect(harness.task?.status).toBe("failed");
    expect(harness.task?.error).toContain("recycled");
    expect(harness.server.aborts).toBe(0);
  });

  test("three failed polls fail the task; earlier ones continue", async () => {
    const harness = makeHarness({ ...STARTING, status: "running", bootId: "boot-1" });
    harness.server.eventsImpl = async () => {
      throw new PumpError("unreachable", "connection reset");
    };
    expect(await pumpAgentOnce(harness.deps)).toEqual({ action: "continue" });
    expect(harness.task?.status).toBe("running");
    expect(await pumpAgentOnce(harness.deps)).toEqual({ action: "continue" });
    expect(await pumpAgentOnce(harness.deps)).toEqual({ action: "stop" });
    expect(harness.task?.status).toBe("failed");
    expect(harness.task?.error).toContain("lost contact");
    expect(harness.server.aborts).toBe(1);
  });

  test("a server that never starts fails a starting task", async () => {
    const harness = makeHarness({ ...STARTING });
    harness.server.ensureUpImpl = async () => {
      throw new PumpError("server_start_failed", "port never opened");
    };
    expect(await pumpAgentOnce(harness.deps)).toEqual({ action: "stop" });
    expect(harness.task?.error).toContain("did not start");
  });

  test("losing the server mid-run fails with a container-lost error", async () => {
    const harness = makeHarness({ ...STARTING, status: "running", bootId: "boot-1" });
    harness.server.ensureUpImpl = async () => {
      throw new PumpError("server_start_failed", "no VM");
    };
    expect(await pumpAgentOnce(harness.deps)).toEqual({ action: "stop" });
    expect(harness.task?.error).toContain("container was lost");
  });

  test("a busy server is aborted and the task fails so the operator resubmits", async () => {
    const harness = makeHarness({ ...STARTING });
    harness.server.submitImpl = async () => {
      throw new PumpError("server_busy", "run active");
    };
    expect(await pumpAgentOnce(harness.deps)).toEqual({ action: "stop" });
    expect(harness.server.aborts).toBe(1);
    expect(harness.task?.error).toContain("resubmit");
  });

  test("a misconfigured model fails fast and aborts the server run", async () => {
    const harness = makeHarness({ ...STARTING, status: "running", bootId: "boot-1" });
    harness.server.eventsImpl = async () => ({
      cursor: 0,
      bootId: "boot-1",
      run: { status: "running" },
      pendingRequests: [{ id: "mr-1", messages: [], options: {} }],
      events: [],
    });
    harness.answerImpl = async () => ({ kind: "misconfigured", message: "set OPENAI_API_KEY" });
    expect(await pumpAgentOnce(harness.deps)).toEqual({ action: "stop" });
    expect(harness.task?.error).toBe("set OPENAI_API_KEY");
    expect(harness.server.aborts).toBe(1);
    expect(harness.server.answers).toEqual([]);
  });

  test("a model error is posted to the server, not treated as fatal", async () => {
    const harness = makeHarness({ ...STARTING, status: "running", bootId: "boot-1" });
    harness.server.eventsImpl = async () => ({
      cursor: 0,
      bootId: "boot-1",
      run: { status: "running" },
      pendingRequests: [{ id: "mr-1", messages: [], options: {} }],
      events: [],
    });
    harness.answerImpl = async () => ({ kind: "error", error: "rate limited" });
    expect(await pumpAgentOnce(harness.deps)).toEqual({ action: "continue" });
    expect(harness.server.answers).toEqual([{ id: "mr-1", answer: { error: "rate limited" } }]);
    expect(harness.task?.status).toBe("running");
  });

  test("a failed POST answer retries on the next iteration", async () => {
    const harness = makeHarness({ ...STARTING, status: "running", bootId: "boot-1" });
    harness.server.eventsImpl = async () => ({
      cursor: 0,
      bootId: "boot-1",
      run: { status: "running" },
      pendingRequests: [{ id: "mr-1", messages: [], options: {} }],
      events: [],
    });
    harness.server.answerImpl = async () => {
      throw new PumpError("answer_failed", "reset");
    };
    expect(await pumpAgentOnce(harness.deps)).toEqual({ action: "continue" });
    expect(harness.task?.status).toBe("running");
  });

  test("a failed server run surfaces its error", async () => {
    const harness = makeHarness({ ...STARTING, status: "running", bootId: "boot-1" });
    harness.server.eventsImpl = async () => ({
      cursor: 0,
      bootId: "boot-1",
      run: { status: "failed", error: "tool blew up" },
      pendingRequests: [],
      events: [],
    });
    expect(await pumpAgentOnce(harness.deps)).toEqual({ action: "stop" });
    expect(harness.task?.status).toBe("failed");
    expect(harness.task?.error).toBe("tool blew up");
  });
});
