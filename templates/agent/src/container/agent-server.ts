/**
 * Agent server: the whole pi-durable agent loop as a plain node HTTP server
 * for container mode (`AGENT_RUNTIME=container`). It hosts a Harness with
 * the standard coding tools (bash/read/edit/write) on the node environment,
 * working directly on the container checkout; model calls are brokered to
 * the DO, so no API key ever enters the container (see `../broker.ts`).
 *
 * Bundled by `scripts/build-agent-server.ts` (esbuild, platform node) into
 * `sandbox/agent/server.mjs`, which the Dockerfile COPYs to
 * `/opt/agent/server.mjs`; the DO starts it there with `node`. Also
 * runnable under bun directly, which is how the E2E test drives it.
 *
 * Protocol (see `../protocol.ts`):
 *   GET  /health                     -> {ok, bootId}
 *   POST /tasks {text}               -> 202 {status, bootId} | 409 when busy
 *   DELETE /tasks                    -> 200 {status} (abort, idempotent)
 *   GET  /events?after=<cursor>&wait=<s<=20>
 *                                    -> {cursor, bootId, run, pendingRequests, events}
 *   POST /model/<requestId> {message}|{error} -> 200 {} | 404
 */

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai";
import {
  ConversationBusy,
  Harness,
  createRegistry,
  defineExtension,
  section,
  type Conversation,
  type EntryId,
  type Submission,
} from "@earendil-works/pi-durable";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { openNodeJsonlStorage } from "@earendil-works/pi-durable/storage/jsonl/node";
import {
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  type BashExecution,
} from "@earendil-works/pi-durable/tools";
import { BROKER_MODEL_ID, BROKER_PROVIDER, createBrokerProvider } from "../broker";
import { REPO_DIR } from "../paths";
import {
  AGENT_SERVER_PORT,
  AGENT_STATE_DIR,
  clampLongPollSeconds,
  parseAfterCursor,
  parseModelAnswer,
  parseTaskBody,
  type EventsResponse,
  type RunState,
  type TranscriptEvent,
} from "../protocol";
import { renderMessages, truncateText } from "../transcript";

export interface AgentServerConfig {
  port: number;
  stateDir: string;
  repoDir: string;
}

/** Resolve config from env, with container defaults. Pure: unit-tested. */
export function configFromEnv(env: NodeJS.ProcessEnv): AgentServerConfig {
  const port = Number(env["AGENT_SERVER_PORT"] ?? AGENT_SERVER_PORT);
  return {
    port: Number.isInteger(port) && port >= 0 && port <= 65535 ? port : AGENT_SERVER_PORT,
    stateDir: env["AGENT_SERVER_DIR"] ?? AGENT_STATE_DIR,
    repoDir: env["AGENT_SERVER_REPO"] ?? REPO_DIR,
  };
}

/** Transcript poll cadence while a run is active. */
const TRANSCRIPT_POLL_MS = 250;

/** In-memory event log cap; the DO mirror is the durable record. */
const MAX_EVENTS = 500;

const MAX_BODY_BYTES = 8 * 1024 * 1024;

export interface AgentServer {
  readonly port: number;
  readonly bootId: string;
  close(): Promise<void>;
}

function json(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
    size += buffer.length;
    if (size > maxBytes) {
      throw new Error("request body too large");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const text = await readBody(req, MAX_BODY_BYTES);
  if (text.trim() === "") {
    return undefined;
  }
  return JSON.parse(text) as unknown;
}

/**
 * Curated tool environment. The container holds no secrets (the DO never
 * sends env there), but tools still do not inherit the server process env:
 * a stray secret in the server env must never reach tool output and the
 * model. PATH/HOME come from the server's own startup env (captured once),
 * so node/git keep working.
 */
function curatedEnv(): Record<string, string> {
  const env: Record<string, string> = { LANG: "C.UTF-8" };
  for (const key of ["PATH", "HOME", "TMPDIR", "TZ", "TERM"]) {
    const value = process.env[key];
    if (value !== undefined && value !== "") {
      env[key] = value;
    }
  }
  return env;
}

function lockToolEnv(execution: BashExecution): void {
  execution.inheritEnv = false;
  execution.env = curatedEnv();
}

export async function startAgentServer(config: AgentServerConfig): Promise<AgentServer> {
  mkdirSync(config.stateDir, { recursive: true });
  mkdirSync(config.repoDir, { recursive: true });
  const bootId = randomUUID();

  const waiters = new Set<() => void>();
  function notify(): void {
    for (const wake of Array.from(waiters)) {
      waiters.delete(wake);
      wake();
    }
  }

  const broker = createBrokerProvider({ onChange: notify });
  const models = createModels();
  models.setProvider(broker);
  const registry = createRegistry();
  registry.install(
    defineExtension({
      name: "agent-container",
      tools: [
        createBashTool({ prepare: async (execution) => lockToolEnv(execution) }),
        createReadTool(),
        createWriteTool(),
        createEditTool(),
      ],
      sections: [
        section(
          "workspace",
          () =>
            `You are a coding agent running inside a sandbox container. The cloned repository (if any) is at ${config.repoDir}; that is your working directory. ` +
            `Use bash, read, write, and edit to do the work. Keep the final summary short: what changed and which commands ran.`
        ),
      ],
    })
  );
  const storage = await openNodeJsonlStorage(config.stateDir, BACKGROUND_CONTEXT);
  const harness = await Harness.open(
    storage,
    {
      models,
      registry,
      env: () => new NodeExecutionEnv({ cwd: config.repoDir }),
    },
    BACKGROUND_CONTEXT
  );
  harness.resume();

  // Establish the transcript cursor silently: entries from before this boot
  // are history, not news. Everything submitted from here on is emitted.
  const bootRoot = await harness.root(BACKGROUND_CONTEXT);
  const bootPage = await bootRoot.entries({ order: "descending" }, 1, undefined, BACKGROUND_CONTEXT);
  let lastEntryId: EntryId | undefined = bootPage.items[0]?.id;

  let run: RunState = { status: "idle" };
  const events: TranscriptEvent[] = [];
  let seq = 0;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  function pushEvent(text: string): void {
    seq += 1;
    events.push({ seq, kind: "transcript", text });
    while (events.length > MAX_EVENTS) {
      events.shift();
    }
  }

  async function pollTranscript(root: Conversation): Promise<void> {
    const page = await root.entries({ order: "descending" }, 50, undefined, BACKGROUND_CONTEXT);
    const ordered = [...page.items].reverse();
    // Entries after lastEntryId are new. When the cursor is missing from
    // the window (only if >50 entries landed between polls), the window is
    // skipped and the cursor jumps to the newest entry.
    let fresh = lastEntryId === undefined;
    for (const entry of ordered) {
      if (!fresh) {
        if (entry.id === lastEntryId) {
          fresh = true;
        }
        continue;
      }
      if (entry.model !== undefined) {
        const text = renderMessages(entry.model).trim();
        if (text !== "") {
          pushEvent(truncateText(text));
        }
      }
    }
    if (ordered.length > 0) {
      lastEntryId = ordered[ordered.length - 1]?.id ?? lastEntryId;
    }
    notify();
  }

  function setRun(next: RunState): void {
    run = next;
    if (run.status === "running" && pollTimer === undefined) {
      pollTimer = setInterval(() => {
        void harness.root(BACKGROUND_CONTEXT).then(
          (root) => pollTranscript(root).catch(() => undefined),
          () => undefined
        );
      }, TRANSCRIPT_POLL_MS);
    } else if (run.status !== "running" && pollTimer !== undefined) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
    notify();
  }

  async function ensureModel(root: Conversation): Promise<void> {
    const agent = await root.agent(BACKGROUND_CONTEXT);
    if (agent.model?.provider !== BROKER_PROVIDER || agent.model?.modelId !== BROKER_MODEL_ID) {
      await root.configure({ model: { provider: BROKER_PROVIDER, modelId: BROKER_MODEL_ID } }, BACKGROUND_CONTEXT);
    }
  }

  async function trackSubmission(root: Conversation, submission: Submission): Promise<void> {
    try {
      const settled = await submission.wait(BACKGROUND_CONTEXT);
      await pollTranscript(root).catch(() => undefined);
      if (settled.status === "done") {
        setRun({ status: "done" });
      } else {
        setRun({ status: "failed", error: `run ended without an answer (${settled.reason})` });
      }
    } catch (error) {
      setRun({ status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }

  async function trackAdopted(): Promise<void> {
    // A run the harness is executing but this server did not submit (busy
    // adoption): wait for idle, then settle from whatever happened.
    try {
      await harness.waitForIdle(BACKGROUND_CONTEXT);
      const root = await harness.root(BACKGROUND_CONTEXT);
      await pollTranscript(root).catch(() => undefined);
      setRun({ status: "done" });
    } catch (error) {
      setRun({ status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }

  function snapshot(after: number): EventsResponse {
    return {
      cursor: seq,
      bootId,
      run,
      pendingRequests: broker.pendingRequests(),
      events: events.filter((event) => event.seq > after),
    };
  }

  function hasNews(after: number): boolean {
    return seq > after || broker.pendingRequests().length > 0 || run.status === "done" || run.status === "failed";
  }

  const server: Server = createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? "/", "http://agent.local");
        if (req.method === "GET" && url.pathname === "/health") {
          json(res, 200, { ok: true, bootId });
          return;
        }
        if (url.pathname === "/tasks" && (req.method === "POST" || req.method === "DELETE")) {
          const root = await harness.root(BACKGROUND_CONTEXT);
          if (req.method === "DELETE") {
            if (run.status === "running") {
              await root.abort(BACKGROUND_CONTEXT);
            }
            json(res, 200, { status: run.status });
            return;
          }
          let body: unknown;
          try {
            body = await readJson(req);
          } catch {
            json(res, 400, { error: "invalid JSON body" });
            return;
          }
          const parsed = parseTaskBody(body);
          if (!parsed.ok) {
            json(res, 400, { error: parsed.message });
            return;
          }
          if (run.status === "running") {
            json(res, 409, { error: "a task is already running" });
            return;
          }
          await ensureModel(root);
          try {
            const submission = await root.submit(
              { type: "input", content: parsed.text, whenBusy: "reject" },
              BACKGROUND_CONTEXT
            );
            setRun({ status: "running" });
            await pollTranscript(root).catch(() => undefined);
            void trackSubmission(root, submission);
            json(res, 202, { status: "running", bootId });
          } catch (error) {
            if (error instanceof ConversationBusy) {
              // The harness is running work this server did not submit
              // (recovered after a restart): adopt it instead of erroring.
              setRun({ status: "running" });
              void trackAdopted();
              json(res, 409, { error: "the agent is already running" });
              return;
            }
            throw error;
          }
          return;
        }
        if (req.method === "GET" && url.pathname === "/events") {
          const after = parseAfterCursor(url.searchParams.get("after"));
          const wait = clampLongPollSeconds(url.searchParams.get("wait"));
          if (hasNews(after) || wait === 0) {
            json(res, 200, snapshot(after));
            return;
          }
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              waiters.delete(wake);
              resolve();
            }, wait * 1000);
            const wake = (): void => {
              clearTimeout(timer);
              resolve();
            };
            waiters.add(wake);
          });
          json(res, 200, snapshot(after));
          return;
        }
        const modelMatch = /^\/model\/([A-Za-z0-9-]+)$/.exec(url.pathname);
        if (req.method === "POST" && modelMatch !== null) {
          const id = modelMatch[1] ?? "";
          let body: unknown;
          try {
            body = await readJson(req);
          } catch {
            json(res, 400, { error: "invalid JSON body" });
            return;
          }
          const parsed = parseModelAnswer(body);
          if (!parsed.ok) {
            json(res, 400, { error: parsed.message });
            return;
          }
          const settled =
            "message" in parsed.value
              ? broker.resolveRequest(id, parsed.value.message)
              : broker.rejectRequest(id, parsed.value.error);
          if (!settled) {
            json(res, 404, { error: "unknown model request" });
            return;
          }
          json(res, 200, {});
          return;
        }
        json(res, 404, { error: "not found" });
      } catch (error) {
        json(res, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const boundPort = typeof address === "object" && address !== null ? address.port : config.port;

  return {
    port: boundPort,
    bootId,
    close: async () => {
      if (pollTimer !== undefined) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
      for (const wake of Array.from(waiters)) {
        waiters.delete(wake);
        wake();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await harness.close(BACKGROUND_CONTEXT).catch(() => undefined);
    },
  };
}

async function main(): Promise<void> {
  const server = await startAgentServer(configFromEnv(process.env));
  console.log(`agent-server ready on 0.0.0.0:${server.port} (boot ${server.bootId})`);
}

const invokedDirectly =
  typeof process.argv[1] === "string" && process.argv[1] !== "" && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  void main().catch((error: unknown) => {
    console.error(`agent-server failed to start: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
