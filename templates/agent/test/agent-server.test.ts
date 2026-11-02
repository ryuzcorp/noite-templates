import { afterEach, describe, expect, test } from "bun:test";

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createModels,
  fauxAssistantMessage,
  fauxToolCall,
  type AssistantMessage,
  type Model,
  type Models,
} from "@earendil-works/pi-ai";
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { configFromEnv, startAgentServer, type AgentServer } from "../src/container/agent-server";
import { parseEventsResponse, type EventsResponse } from "../src/protocol";

const servers: AgentServer[] = [];
afterEach(async () => {
  while (servers.length > 0) {
    await servers.pop()?.close();
  }
});

async function startServer(): Promise<{ server: AgentServer; base: string; repoDir: string }> {
  const root = mkdtempSync(join(tmpdir(), "agent-server-"));
  const server = await startAgentServer({
    port: 0,
    stateDir: join(root, "state"),
    repoDir: join(root, "repo"),
  });
  servers.push(server);
  return { server, base: `http://127.0.0.1:${server.port}`, repoDir: join(root, "repo") };
}

async function postJson(base: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function events(base: string, after: number, wait: number): Promise<EventsResponse> {
  const res = await fetch(`${base}/events?after=${after}&wait=${wait}`);
  expect(res.status).toBe(200);
  const parsed = parseEventsResponse(await res.json());
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) {
    throw new Error("unreachable");
  }
  return parsed.value;
}

function fauxModels(): { models: Models; model: Model<"faux">; respond: (messages: AssistantMessage[]) => void } {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const model = models.getModel("faux", faux.getModel().id) as Model<"faux">;
  return { models, model, respond: (messages) => faux.setResponses(messages) };
}

describe("configFromEnv", () => {
  test("container defaults and overrides", () => {
    expect(configFromEnv({})).toEqual({
      port: 8787,
      stateDir: "/workspace/.agent",
      repoDir: "/workspace/repo",
    });
    expect(configFromEnv({ AGENT_SERVER_PORT: "9999", AGENT_SERVER_DIR: "/tmp/s", AGENT_SERVER_REPO: "/tmp/r" })).toEqual(
      { port: 9999, stateDir: "/tmp/s", repoDir: "/tmp/r" }
    );
    expect(configFromEnv({ AGENT_SERVER_PORT: "nonsense" }).port).toBe(8787);
  });
});

describe("agent server", () => {
  test("health reports the boot id", async () => {
    const { server, base } = await startServer();
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, bootId: server.bootId });
  });

  test(
    "end to end: faux model drives real tools, transcript streams as events",
    async () => {
      const { server, base, repoDir } = await startServer();
      const fake = fauxModels();
      fake.respond([
        fauxAssistantMessage([fauxToolCall("bash", { command: "printf 'HELLO' > greeting.txt" })], {
          stopReason: "toolUse",
        }),
        fauxAssistantMessage("created greeting.txt"),
      ]);
      const submitted = await postJson(base, "/tasks", { text: "write the greeting file" });
      expect(submitted.status).toBe(202);
      expect(await submitted.json()).toMatchObject({ status: "running", bootId: server.bootId });

      let after = 0;
      const transcript: string[] = [];
      let bootId = "";
      let polls = 0;
      let terminal: EventsResponse | undefined;
      for (; polls < 20; polls++) {
        const batch = await events(base, after, 2);
        bootId = batch.bootId;
        after = batch.cursor;
        for (const event of batch.events) {
          transcript.push(event.text);
        }
        for (const request of batch.pendingRequests) {
          const answer = await fake.models.completeSimple(fake.model, { messages: request.messages });
          const posted = await postJson(base, `/model/${request.id}`, { message: answer });
          expect(posted.status).toBe(200);
        }
        if (batch.run.status === "done" || batch.run.status === "failed") {
          terminal = batch;
          break;
        }
      }
      expect(terminal?.run.status).toBe("done");
      expect(bootId).toBe(server.bootId);
      // The scripted tool call really executed against the checkout dir.
      expect(readFileSync(join(repoDir, "greeting.txt"), "utf-8")).toBe("HELLO");
      const joined = transcript.join("\n");
      expect(joined).toContain("write the greeting file");
      expect(joined).toContain("greeting.txt");
    },
    { timeout: 60_000 }
  );

  test(
    "a second task is refused while one runs; abort settles the run",
    async () => {
      const { base } = await startServer();
      const first = await postJson(base, "/tasks", { text: "take your time" });
      expect(first.status).toBe(202);
      const second = await postJson(base, "/tasks", { text: "me too" });
      expect(second.status).toBe(409);
      expect(await second.json()).toEqual({ error: "a task is already running" });

      // The run is stuck on its first model request (nothing answers it).
      const batch = await events(base, 0, 2);
      expect(batch.run.status).toBe("running");
      expect(batch.pendingRequests.length).toBeGreaterThanOrEqual(0);

      const aborted = await fetch(`${base}/tasks`, { method: "DELETE" });
      expect(aborted.status).toBe(200);
      // Abort settles the run even though no model answer ever arrives.
      let terminal: EventsResponse | undefined;
      let after = batch.cursor;
      for (let poll = 0; poll < 10; poll++) {
        const next = await events(base, after, 2);
        after = next.cursor;
        if (next.run.status === "done" || next.run.status === "failed") {
          terminal = next;
          break;
        }
      }
      expect(terminal?.run.status).toBe("failed");
      // The server is usable again.
      const retry = await postJson(base, "/tasks", { text: "second try" });
      expect(retry.status).toBe(202);
    },
    { timeout: 60_000 }
  );

  test("unknown model requests 404; bad bodies 400 as JSON", async () => {
    const { base } = await startServer();
    const unknown = await postJson(base, "/model/mr-999", { error: "nope" });
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("content-type")).toContain("application/json");

    const badTask = await postJson(base, "/tasks", {});
    expect(badTask.status).toBe(400);
    expect(await badTask.json()).toHaveProperty("error");

    const missing = await fetch(`${base}/nope`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toHaveProperty("error");
  });

  test("an idle poll returns an empty snapshot", async () => {
    const { base } = await startServer();
    const batch = await events(base, 0, 0);
    expect(batch.run.status).toBe("idle");
    expect(batch.events).toEqual([]);
    expect(batch.pendingRequests).toEqual([]);
  });
});
