import { describe, expect, test } from "bun:test";

import { PumpError } from "../src/container-pump";
import { AGENT_SERVER_PATH, AGENT_SERVER_PORT } from "../src/protocol";
import { createAgentServerClient, type AgentServerSandbox } from "../src/server-client";

interface FetchCall {
  port: number;
  request: Request;
}

class FakeSandbox implements AgentServerSandbox {
  fetches: FetchCall[] = [];
  fetchImpl: (port: number, request: Request) => Promise<Response> = async () =>
    new Response(JSON.stringify({ ok: true, bootId: "boot-1" }), { status: 200 });
  execs: Array<{ argv: string[]; options?: { stdout?: "ignore"; stderr?: "ignore" } }> = [];
  execImpl: (argv: string[]) => Promise<unknown> = async () => ({});
  runs: string[][] = [];

  async run(argv: string[]): Promise<{ stdout: ArrayBuffer; stderr: ArrayBuffer; exitCode: number }> {
    this.runs.push(argv);
    return { stdout: new ArrayBuffer(0), stderr: new ArrayBuffer(0), exitCode: 0 };
  }

  async exec(argv: string[], options?: { stdout?: "ignore"; stderr?: "ignore" }): Promise<unknown> {
    this.execs.push({ argv, options });
    return this.execImpl(argv);
  }

  async fetch(port: number, request: Request): Promise<Response> {
    this.fetches.push({ port, request });
    return this.fetchImpl(port, request);
  }
}

/** Fake clock advanced by the fake sleep: no wall-clock waits. */
function fakeTime() {
  let now = 1_700_000_000_000;
  return {
    now: () => now,
    sleep: async (ms: number): Promise<void> => {
      now += ms;
    },
  };
}

const EVENTS = {
  cursor: 0,
  bootId: "boot-1",
  run: { status: "running" },
  pendingRequests: [],
  events: [],
};

describe("createAgentServerClient", () => {
  test("ensureUp probes health and starts nothing when the server is up", async () => {
    const sandbox = new FakeSandbox();
    const time = fakeTime();
    const client = createAgentServerClient(sandbox, { sleep: time.sleep, now: time.now });
    await client.ensureUp();
    expect(sandbox.execs).toEqual([]);
    expect(sandbox.runs).toEqual([]);
    expect(sandbox.fetches).toHaveLength(1);
    expect(sandbox.fetches[0]?.port).toBe(AGENT_SERVER_PORT);
    expect(new URL(sandbox.fetches[0]?.request.url).pathname).toBe("/health");
  });

  test("ensureUp restarts a down server and waits for readiness", async () => {
    const sandbox = new FakeSandbox();
    let calls = 0;
    sandbox.fetchImpl = async () => {
      calls += 1;
      // Two failed probes, then readiness right after the start.
      return calls <= 2 ? new Response("down", { status: 500 }) : new Response("{}", { status: 200 });
    };
    const time = fakeTime();
    const client = createAgentServerClient(sandbox, { sleep: time.sleep, now: time.now });
    await client.ensureUp();
    expect(sandbox.runs).toEqual([["pkill", "-f", AGENT_SERVER_PATH]]);
    expect(sandbox.execs).toHaveLength(1);
    expect(sandbox.execs[0]?.argv).toEqual(["node", AGENT_SERVER_PATH]);
  });

  test("ensureUp fails loudly when the server never becomes ready", async () => {
    const sandbox = new FakeSandbox();
    sandbox.fetchImpl = async () => new Response("down", { status: 500 });
    const time = fakeTime();
    const client = createAgentServerClient(sandbox, { sleep: time.sleep, now: time.now });
    const error = await client.ensureUp().then(
      () => null,
      (failure: unknown) => failure
    );
    expect(error).toBeInstanceOf(PumpError);
    expect((error as PumpError).code).toBe("server_start_failed");
    expect(sandbox.execs).toHaveLength(1);
  });

  test("ensureUp maps a failed start to server_start_failed", async () => {
    const sandbox = new FakeSandbox();
    sandbox.fetchImpl = async () => new Response("down", { status: 500 });
    const transport = new Error("no VM");
    (transport as { code?: string }).code = "CONTAINER_UNAVAILABLE";
    sandbox.execImpl = async () => {
      throw transport;
    };
    const time = fakeTime();
    const client = createAgentServerClient(sandbox, { sleep: time.sleep, now: time.now });
    const error = await client.ensureUp().then(
      () => null,
      (failure: unknown) => failure
    );
    expect(error).toBeInstanceOf(PumpError);
    expect((error as PumpError).code).toBe("server_start_failed");
    expect((error as Error).message).toContain("container_unavailable");
  });

  test("submit posts the task and reads the boot id; busy maps to server_busy", async () => {
    const sandbox = new FakeSandbox();
    sandbox.fetchImpl = async (_port, request) => {
      expect(request.method).toBe("POST");
      expect(new URL(request.url).pathname).toBe("/tasks");
      return new Response(JSON.stringify({ status: "running", bootId: "boot-9" }), { status: 202 });
    };
    const client = createAgentServerClient(sandbox);
    expect(await client.submit("do it")).toEqual({ bootId: "boot-9" });

    sandbox.fetchImpl = async () => new Response("{}", { status: 409 });
    const busy = await client.submit("do it").then(
      () => null,
      (failure: unknown) => failure
    );
    expect(busy).toBeInstanceOf(PumpError);
    expect((busy as PumpError).code).toBe("server_busy");
  });

  test("events polls one batch and validates its shape", async () => {
    const sandbox = new FakeSandbox();
    sandbox.fetchImpl = async (_port, request) => {
      expect(new URL(request.url).pathname).toBe("/events");
      return new Response(JSON.stringify(EVENTS), { status: 200 });
    };
    const client = createAgentServerClient(sandbox);
    const batch = await client.events(3, 5);
    expect(batch.bootId).toBe("boot-1");
    expect(new URL(sandbox.fetches[0]?.request.url as string).searchParams.get("after")).toBe("3");

    sandbox.fetchImpl = async () => new Response(JSON.stringify({ nope: true }), { status: 200 });
    const bad = await client.events(0, 0).then(
      () => null,
      (failure: unknown) => failure
    );
    expect((bad as PumpError).code).toBe("bad_response");
  });

  test("answer posts the model answer; 404 means unknown", async () => {
    const sandbox = new FakeSandbox();
    sandbox.fetchImpl = async () => new Response("{}", { status: 200 });
    const client = createAgentServerClient(sandbox);
    expect(await client.answer("mr-1", { error: "rate limited" })).toBe("ok");
    expect(new URL(sandbox.fetches[0]?.request.url as string).pathname).toBe("/model/mr-1");

    sandbox.fetchImpl = async () => new Response("{}", { status: 404 });
    expect(await client.answer("mr-2", { error: "late" })).toBe("unknown");
  });

  test("abort is best-effort and never throws", async () => {
    const sandbox = new FakeSandbox();
    sandbox.fetchImpl = async () => {
      throw new Error("gone");
    };
    const client = createAgentServerClient(sandbox);
    await client.abort();
    expect(sandbox.fetches).toHaveLength(1);
  });
});
