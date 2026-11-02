import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createModels,
  fauxAssistantMessage,
  type AssistantMessage,
  type AuthContext,
  type Message,
  type MutableModels,
} from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import {
  fauxProvider,
  fauxToolCall,
  type FauxProviderHandle,
} from "@earendil-works/pi-ai/providers/faux";
import {
  ConversationBusy,
  Harness,
  createRegistry,
  defineExtension,
  section,
  type Conversation,
  type EntryId,
  type SubmissionId,
} from "@earendil-works/pi-durable";
import { openDurableObjectSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/cloudflare";
import { defineDurableState, type DurableStateContext } from "void/durable";
import { getSandbox, type SandboxClient } from "void/sandbox";

import { createCloneDeps, type CloneSandbox } from "../src/clone-deps";
import { pumpAgentOnce, type ContainerTaskRecord, type ModelAnswerOutcome } from "../src/container-pump";
import type { Env } from "../src/env";
import { describeContainerError } from "../src/errors";
import { agentRuntime, OPENAI_PROVIDER, parseModelRef, withEndpointModels, type ModelSelection } from "../src/model";
import { REPO_DIR } from "../src/paths";
import {
  ensureCheckout,
  GIT_TIMEOUT,
  runCloneAndStore,
  type RepositoryRecord,
  type RepositoryStatus,
  type RepoStore,
} from "../src/repo-clone";
export type { RepositoryRecord, RepositoryStatus } from "../src/repo-clone";
import type { ModelRequestPayload } from "../src/protocol";
import { parseRepoHosts, validateRepositoryUrl, validRef } from "../src/repo-url";
import { createAgentServerClient, type AgentServerSandbox } from "../src/server-client";
import { createWorkerTools, type WorkerToolsSandbox } from "../src/tools";
import { fauxTurn, renderMessages, truncateText } from "../src/transcript";

/**
 * Pi Durable agent in a Void Durable Object. One named sandbox is one
 * object: durable records live in the object's storage, the pi harness
 * transcript in its SQLite tables (via `openDurableObjectSqliteStorage`),
 * and the Void sandbox it drives is the tool backend.
 *
 * Two runtimes (AGENT_RUNTIME): "worker" (default) runs the harness here
 * with tools exec'ing in the sandbox; "container" runs the whole agent loop
 * as a process in the sandbox, with model calls brokered here so the API
 * key never enters the container.
 *
 * Alarm composition: Void serializes every method and the alarm hook
 * through one queue, so no `blockConcurrencyWhile` is needed — and every
 * background wakeup (clone pump, harness wake, container pump) multiplexes
 * through the single `alarm` hook via `context.setAlarm`. The sandbox is a
 * separate Void-managed object now, so this object owns its own alarm.
 * Every callback is idempotent. Reads queue behind the in-flight
 * iteration, so iterations stay brief (short pump polls, bounded harness
 * drives); a slow GET during a run is the known cost of the stock
 * durable-state shape, never a hang.
 */

type AgentState = { name: string };

type Ctx = DurableStateContext<AgentState, Env>;

const REPO_KEY = "agent:repo";
const TASK_KEY = "agent:task";
const CTASK_KEY = "agent:ctask";
const MIRROR_KEY = "agent:cmirror";
const TRANSCRIPT_TAIL = 50;
const TRANSCRIPT_CAP = 32_768;
const MIRROR_CAP = 131_072;

/** How long one harnessWake invocation drives the run before re-arming. */
const WAKE_DRIVE_MS = 10_000;
/** Long-poll wait per container-pump iteration (protocol max is 20). */
const DO_PUMP_POLL_SECONDS = 5;

const SANDBOX_OPTIONS = { enableInternet: true, inactivityTimeoutMs: 10 * 60 * 1000 };

export const MODEL_SETUP_MESSAGE =
  "No model is configured. Set OPENAI_API_KEY and MODEL in Noite Settings -> Environment and redeploy " +
  "(OPENAI_BASE_URL selects any OpenAI-compatible endpoint, default api.openai.com); " +
  "MODEL=faux runs a cred-less test loop.";

export type WorkerTaskStatus = "running" | "done" | "failed";

export interface WorkerTaskRecord {
  status: WorkerTaskStatus;
  submissionId?: SubmissionId;
  error?: string;
  updatedAt: number;
}

interface MirrorRecord {
  text: string;
  truncated: boolean;
}

export type StartErrorCode =
  | "invalid_repository"
  | "invalid_ref"
  | "invalid_task"
  | "repo_busy"
  | "task_busy"
  | "model_not_configured"
  | "unknown_model"
  | "submit_failed"
  | "init_failed";

export type StartResult = { ok: true } | { ok: false; code: StartErrorCode; message: string };

export type TaskStatus = "idle" | "running" | "done" | "failed";

export interface SandboxState {
  runtime: "worker" | "container";
  busy: boolean;
  model: string;
  repository: {
    url?: string;
    ref?: string;
    commit?: string;
    status: "idle" | RepositoryStatus;
    error?: string;
  };
  task: { status: TaskStatus; error?: string };
  transcript: string;
  /** Set when the worker harness failed to open (degraded state). */
  initError?: string;
  /** Set when the container transcript mirror dropped earlier entries. */
  mirrorTruncated?: boolean;
}

export type DiffResult =
  | { ok: true; commit?: string; status: string; stat: string; diff: string }
  | { ok: false; code: "no_repository" | "repo_busy" | "git_failed"; message: string };

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

interface Ready {
  harness: Harness;
  models: MutableModels;
  faux: FauxProviderHandle;
}

/**
 * Per-isolate harness cache, keyed by the object's storage identity (stable
 * across method calls on one isolate, fresh after an eviction). Void already
 * serializes methods, so plain memoization is safe — no concurrency gate.
 */
interface AgentEntry {
  harness?: Harness;
  models?: MutableModels;
  faux?: FauxProviderHandle;
  initPromise: Promise<void> | null;
  initError: string | null;
  wakeFailures: number;
  pumpRunning: boolean;
}

const entriesByStorage = new WeakMap<DurableObjectStorage, AgentEntry>();

function entryFor(storage: DurableObjectStorage): AgentEntry {
  let entry = entriesByStorage.get(storage);
  if (entry === undefined) {
    entry = { initPromise: null, initError: null, wakeFailures: 0, pumpRunning: false };
    entriesByStorage.set(storage, entry);
  }
  return entry;
}

/**
 * The Void sandbox for this object, resolved lazily: tools are created at
 * harness init (when the name may not be set yet) but only run once a task
 * is admitted. Cloning needs egress, hence `enableInternet`.
 */
function sandboxClient(context: Ctx): WorkerToolsSandbox & CloneSandbox & AgentServerSandbox {
  let client: Promise<SandboxClient> | null = null;
  const get = (): Promise<SandboxClient> => {
    if (client === null) {
      const name = context.state.name;
      if (name === "") {
        throw new Error("sandbox name is not set");
      }
      client = getSandbox(name, SANDBOX_OPTIONS);
    }
    return client;
  };
  return {
    run: async (argv, options) => (await get()).run(argv, options),
    exec: async (argv, options) => (await get()).exec(argv, options),
    fetch: async (port, request) => (await get()).fetch(port, request),
    files: {
      stat: async (path: string) => (await get()).files.stat(path),
      readFile: async (path: string) => (await get()).files.readFile(path),
      writeFile: async (path: string, content: string) => {
        await (await get()).files.writeFile(path, content);
      },
    },
  };
}

/** The repository record in object storage, as the clone module sees it. */
function repoStore(context: Ctx): RepoStore {
  return {
    loadRepo: async () => (await context.storage.get<RepositoryRecord>(REPO_KEY)) ?? null,
    saveRepo: (record) => context.storage.put(REPO_KEY, record),
  };
}

/**
 * Start (or join) harness init. A failed init resets, so the next call
 * retries on a fresh attempt instead of pinning the failure.
 */
async function ensureReady(context: Ctx): Promise<{ ok: true; ready: Ready } | { ok: false; message: string }> {
  const entry = entryFor(context.storage);
  if (entry.harness !== undefined && entry.models !== undefined && entry.faux !== undefined) {
    return { ok: true, ready: { harness: entry.harness, models: entry.models, faux: entry.faux } };
  }
  if (entry.initPromise === null) {
    entry.initError = null;
    entry.initPromise = initHarness(context, entry).then(
      () => undefined,
      (error: unknown) => {
        entry.initPromise = null;
        entry.initError = error instanceof Error ? error.message : String(error);
        throw error;
      }
    );
  }
  try {
    await entry.initPromise;
  } catch {
    // Fall through to the field check: it reports the stored error.
  }
  if (entry.harness !== undefined && entry.models !== undefined && entry.faux !== undefined) {
    return { ok: true, ready: { harness: entry.harness, models: entry.models, faux: entry.faux } };
  }
  return { ok: false, message: entry.initError ?? "harness failed to open" };
}

async function initHarness(context: Ctx, entry: AgentEntry): Promise<void> {
  const authContext: AuthContext = {
    env: async (name) => {
      // pi-ai's OpenAI auth reads OPENAI_API_KEY; serve it from the app
      // env vars so the token stays in Worker env, never in code.
      if (name === "OPENAI_API_KEY") {
        return nonEmpty(context.env.OPENAI_API_KEY);
      }
      return undefined;
    },
    fileExists: async () => false,
  };
  const models = createModels({ authContext });
  const openai = openaiProvider();
  // Any OpenAI-compatible endpoint works (OpenAI, Azure, Ollama, vLLM,
  // OpenRouter, AI Gateway's /openai route, ...); see withEndpointModels.
  const endpoint = nonEmpty(context.env.OPENAI_BASE_URL);
  const selected = parseModelRef(context.env.MODEL);
  models.setProvider(withEndpointModels(openai, endpoint, selected.kind === "openai" ? selected.modelId : ""));
  const faux = fauxProvider();
  models.setProvider(faux.provider);
  entry.models = models;
  entry.faux = faux;

  const registry = createRegistry();
  registry.install(
    defineExtension({
      name: "agent-sandbox",
      tools: createWorkerTools(sandboxClient(context)),
      sections: [
        section(
          "workspace",
          () =>
            `You are a coding agent working inside a sandbox container. The cloned repository (if any) is at ${REPO_DIR}; every command already runs there. ` +
            `Use exec, read_file, and write_file to do the work. Keep the final summary short: what changed and which commands ran.`
        ),
      ],
    })
  );

  const storage = await openDurableObjectSqliteStorage(context.storage);
  const harness = await Harness.open(
    storage,
    {
      models,
      registry,
      onWake: (wake) => {
        // Minimal arming: the alarm chains itself while work is active and
        // the submit paths arm the first row, so onWake only covers the two
        // cases nobody else does — a sleep due while idle, and recovery
        // right after open (entry.harness is still unset then). A failed
        // setAlarm is retried at the next change or RPC.
        void (async () => {
          try {
            if (!wake.active && wake.at !== undefined) {
              await context.storage.setAlarm(wake.at);
            } else if (wake.active && entry.harness === undefined) {
              await context.storage.setAlarm(Date.now());
            }
          } catch {
            // Retried at the next wake change or RPC.
          }
        })();
      },
    },
    BACKGROUND_CONTEXT
  );
  entry.harness = harness;
  harness.resume();
  if (harness.wake().active) {
    await context.storage.setAlarm(Date.now());
  }
}

/**
 * Check the configured model without touching the conversation: faux is
 * always usable; otherwise the key must be set and the id must resolve.
 */
function checkModel(
  context: Ctx,
  ready: Ready
):
  | { ok: true; selection: ModelSelection }
  | { ok: false; code: "model_not_configured" | "unknown_model"; message: string } {
  const selection = parseModelRef(context.env.MODEL);
  if (selection.kind === "faux") {
    return { ok: true, selection };
  }
  if (nonEmpty(context.env.OPENAI_API_KEY) === undefined) {
    return { ok: false, code: "model_not_configured", message: MODEL_SETUP_MESSAGE };
  }
  const model = ready.models.getModel(OPENAI_PROVIDER, selection.modelId);
  if (model === undefined) {
    return {
      ok: false,
      code: "unknown_model",
      message: `Model "${selection.modelId}" is not in the OpenAI catalog (custom endpoints accept any id).`,
    };
  }
  return { ok: true, selection };
}

/**
 * Root conversation with the configured model. Faux answers are topped up
 * to a small bounded pool (each model call consumes one): no accumulation
 * across submits, no starvation inside tool loops.
 */
async function resolveConversation(
  context: Ctx,
  ready: Ready
): Promise<
  | { ok: true; root: Conversation }
  | { ok: false; code: "model_not_configured" | "unknown_model"; message: string }
> {
  const checked = checkModel(context, ready);
  if (!checked.ok) {
    return checked;
  }
  const root = await ready.harness.root(BACKGROUND_CONTEXT);
  if (checked.selection.kind === "faux") {
    const modelId = ready.faux.getModel().id;
    await ensureModel(root, { provider: "faux", modelId });
    topUpFaux(context, ready.faux);
    return { ok: true, root };
  }
  await ensureModel(root, { provider: OPENAI_PROVIDER, modelId: checked.selection.modelId });
  return { ok: true, root };
}

function topUpFaux(context: Ctx, faux: FauxProviderHandle): void {
  // Container mode runs pi-durable's standard tools (`bash`); worker mode
  // runs this object's `exec`.
  const shellTool = agentRuntime(context.env.AGENT_RUNTIME) === "container" ? "bash" : "exec";
  while (faux.getPendingResponseCount() < 4) {
    faux.appendResponses([
      (responseContext) => {
        const turn = fauxTurn(responseContext.messages, shellTool);
        return turn.kind === "tool"
          ? fauxAssistantMessage([fauxToolCall(turn.name, turn.args)], { stopReason: "toolUse" })
          : fauxAssistantMessage(turn.text);
      },
    ]);
  }
}

async function ensureModel(root: Conversation, ref: { provider: string; modelId: string }): Promise<void> {
  const agent = await root.agent(BACKGROUND_CONTEXT);
  if (agent.model?.provider !== ref.provider || agent.model?.modelId !== ref.modelId) {
    await root.configure({ model: ref }, BACKGROUND_CONTEXT);
  }
}

async function renderTail(
  root: Conversation,
  limit: number
): Promise<{ entries: Array<{ id: EntryId; model?: readonly Message[] }>; text: string }> {
  const page = await root.entries({ order: "descending" }, limit, undefined, BACKGROUND_CONTEXT);
  const ordered = [...page.items].reverse();
  const messages: Message[] = [];
  for (const entry of ordered) {
    if (entry.model !== undefined) {
      messages.push(...entry.model);
    }
  }
  return {
    entries: ordered.map((entry) => ({
      id: entry.id,
      ...(entry.model === undefined ? {} : { model: entry.model }),
    })),
    text: truncateText(renderMessages(messages), TRANSCRIPT_CAP),
  };
}

// ------------------------------------------------------------------
// RPC: repository (async; no harness needed, so cloning works before the
// model is configured and while the harness is broken).
// ------------------------------------------------------------------

/**
 * Validate, durably record a clone/refresh op, and return at once; the
 * alarm performs it in the background. Serialized by Void's method queue:
 * two concurrent starters cannot both pass the busy check.
 */
async function startRepository(context: Ctx, name: string, url: string, ref?: string): Promise<StartResult> {
  context.state.name = name;
  const hosts = parseRepoHosts(context.env.REPO_HOSTS);
  const valid = validateRepositoryUrl(url, hosts);
  if (!valid.ok) {
    return { ok: false, code: "invalid_repository", message: valid.message };
  }
  if (ref !== undefined && !validRef(ref)) {
    return { ok: false, code: "invalid_ref", message: "invalid ref" };
  }
  const existing = await context.storage.get<RepositoryRecord>(REPO_KEY);
  if (existing?.status === "cloning") {
    return { ok: false, code: "repo_busy", message: "a repository clone is already in progress" };
  }
  // Inverse of the task-start checks: re-cloning under a running agent
  // would wipe or replace the tree it works on.
  const ctask = await context.storage.get<ContainerTaskRecord>(CTASK_KEY);
  const wtask = await context.storage.get<WorkerTaskRecord>(TASK_KEY);
  if (ctask?.status === "starting" || ctask?.status === "running" || wtask?.status === "running") {
    return { ok: false, code: "task_busy", message: "a task is running; wait for it to finish" };
  }
  const record: RepositoryRecord = {
    url: valid.normalized,
    ...(ref === undefined ? {} : { ref }),
    status: "cloning",
  };
  try {
    await context.storage.put<RepositoryRecord>(REPO_KEY, record);
    await context.setAlarm(Date.now());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await context.storage
      .put<RepositoryRecord>(REPO_KEY, { ...record, status: "failed", error: message })
      .catch(() => undefined);
    return { ok: false, code: "submit_failed", message };
  }
  return { ok: true };
}

/**
 * Perform the recorded clone/refresh. Idempotent: it only acts while the
 * record still says `cloning`.
 */
async function repositoryPump(context: Ctx): Promise<void> {
  try {
    const record = await context.storage.get<RepositoryRecord>(REPO_KEY);
    if (record?.status !== "cloning") {
      return;
    }
    await runCloneAndStore(repoStore(context), createCloneDeps(sandboxClient(context)), record.url, record.ref);
  } catch (error) {
    // Unexpected (a bug): never leave the record stuck on `cloning`.
    const record = await context.storage.get<RepositoryRecord>(REPO_KEY).catch(() => null);
    if (record?.status === "cloning") {
      const message = error instanceof Error ? error.message : String(error);
      await context.storage
        .put<RepositoryRecord>(REPO_KEY, { ...record, status: "failed", error: message })
        .catch(() => undefined);
    }
  }
}

// ------------------------------------------------------------------
// RPC: task (async in both runtimes; 202 semantics live in the routes).
// ------------------------------------------------------------------

/**
 * Durably admit one task and return at once; background work (the harness
 * in worker mode, the pump chain in container mode) performs it. Concurrent
 * submissions are refused with `task_busy` (pi-durable `whenBusy: "reject"`
 * in worker mode, a record check in container mode): one run at a time per
 * sandbox.
 */
async function startTask(context: Ctx, name: string, text: string): Promise<StartResult> {
  context.state.name = name;
  if (text.trim() === "" || text.length > 20_000) {
    return { ok: false, code: "invalid_task", message: "task text is required (max 20000 chars)" };
  }
  if (agentRuntime(context.env.AGENT_RUNTIME) === "container") {
    return startContainerTask(context, text);
  }
  return startWorkerTask(context, text);
}

async function startWorkerTask(context: Ctx, text: string): Promise<StartResult> {
  const ready = await ensureReady(context);
  if (!ready.ok) {
    return { ok: false, code: "init_failed", message: ready.message };
  }
  const repository = await context.storage.get<RepositoryRecord>(REPO_KEY);
  if (repository?.status === "cloning") {
    return { ok: false, code: "repo_busy", message: "repository clone in progress; wait for it to finish" };
  }
  // The container is ephemeral: a restart wipes the checkout while the
  // record still says `ready`. Restore it before the run sees the tree.
  const ensured = await ensureCheckout(
    repoStore(context),
    createCloneDeps(sandboxClient(context)),
    context.env.REPO_HOSTS
  );
  if (!ensured.ok) {
    return { ok: false, code: "submit_failed", message: ensured.message };
  }
  const resolved = await resolveConversation(context, ready.ready);
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, message: resolved.message };
  }
  try {
    const submission = await resolved.root.submit(
      { type: "input", content: text, whenBusy: "reject" },
      BACKGROUND_CONTEXT
    );
    try {
      await context.storage.put<WorkerTaskRecord>(TASK_KEY, {
        status: "running",
        submissionId: submission.id,
        updatedAt: Date.now(),
      });
      // The run starts in this invocation, but the response goes out now;
      // the alarm keeps it progressing after the response (and revives it
      // after an eviction).
      await context.setAlarm(Date.now());
    } catch (inner) {
      // Leave no untracked run behind (best-effort: storage is failing).
      await ready.ready.harness.abortSubmission(submission.id, BACKGROUND_CONTEXT).catch(() => undefined);
      throw inner;
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof ConversationBusy) {
      return { ok: false, code: "task_busy", message: "a task is already running; wait for it to finish" };
    }
    const described = describeContainerError(error);
    return { ok: false, code: "submit_failed", message: described.message };
  }
}

async function startContainerTask(context: Ctx, text: string): Promise<StartResult> {
  const repository = await context.storage.get<RepositoryRecord>(REPO_KEY);
  if (repository?.status === "cloning") {
    return { ok: false, code: "repo_busy", message: "repository clone in progress; wait for it to finish" };
  }
  // Fail fast on a broken harness or missing model: the pump would only
  // fail the task with the same message after a 202.
  const ready = await ensureReady(context);
  if (!ready.ok) {
    return { ok: false, code: "init_failed", message: ready.message };
  }
  const checked = checkModel(context, ready.ready);
  if (!checked.ok) {
    return { ok: false, code: checked.code, message: checked.message };
  }
  // Ephemeral-container recovery (see startWorkerTask). Slow work runs here
  // because the busy check below must observe the restored record.
  const ensured = await ensureCheckout(
    repoStore(context),
    createCloneDeps(sandboxClient(context)),
    context.env.REPO_HOSTS
  );
  if (!ensured.ok) {
    return { ok: false, code: "submit_failed", message: ensured.message };
  }
  // Re-check: serialized by the method queue, but the restore above awaited
  // slow work while queued behind nothing else — a clone admitted earlier
  // in the queue may have landed since the fast-path check.
  const current = await context.storage.get<RepositoryRecord>(REPO_KEY);
  if (current?.status === "cloning") {
    return { ok: false, code: "repo_busy", message: "repository clone in progress; wait for it to finish" };
  }
  const existing = await context.storage.get<ContainerTaskRecord>(CTASK_KEY);
  if (existing?.status === "starting" || existing?.status === "running") {
    return { ok: false, code: "task_busy", message: "a task is already running; wait for it to finish" };
  }
  const record: ContainerTaskRecord = {
    status: "starting",
    text,
    cursor: 0,
    failures: 0,
    updatedAt: Date.now(),
  };
  try {
    await context.storage.put<ContainerTaskRecord>(CTASK_KEY, record);
    await context.storage.put<MirrorRecord>(MIRROR_KEY, { text: "", truncated: false });
    await context.setAlarm(Date.now());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await context.storage
      .put<ContainerTaskRecord>(CTASK_KEY, { ...record, status: "failed", text: undefined, error: message })
      .catch(() => undefined);
    return { ok: false, code: "submit_failed", message };
  }
  return { ok: true };
}

/**
 * Drive the worker harness. Resume, run until idle or the drive budget,
 * sync the tracked submission, then re-arm while work remains (immediately
 * when active, at the sleep deadline when only a sleep is pending, not at
 * all when idle). Unknown failures get bounded retries, then the chain
 * stops: the next user RPC retries, and an evicted instance recovers via
 * open + onWake.
 */
async function harnessWake(context: Ctx): Promise<void> {
  const entry = entryFor(context.storage);
  try {
    const ready = await ensureReady(context);
    if (!ready.ok) {
      return;
    }
    ready.ready.harness.resume();
    const idle = ready.ready.harness.waitForIdle(BACKGROUND_CONTEXT);
    void idle.then(
      () => undefined,
      () => undefined
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        idle,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, WAKE_DRIVE_MS);
        }),
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
    await syncWorkerTask(context, ready.ready.harness);
    const wake = ready.ready.harness.wake();
    if (wake.active) {
      // Ordinary work pending (the tracked run is unsettled): continue
      // immediately. Background-only activity (e.g. a compaction task,
      // which waitForIdle does not cover): poll slowly instead of
      // tight-looping alarms. A new submit always arms its own alarm.
      const tracked = await context.storage.get<WorkerTaskRecord>(TASK_KEY);
      await context.setAlarm(Date.now() + (tracked?.status === "running" ? 0 : 10_000));
    } else if (wake.at !== undefined) {
      await context.setAlarm(wake.at);
    }
    entry.wakeFailures = 0;
  } catch (error) {
    entry.wakeFailures += 1;
    console.error(
      `harnessWake failed (${entry.wakeFailures}): ${error instanceof Error ? error.message : String(error)}`
    );
    if (entry.wakeFailures < 3) {
      await context.setAlarm(Date.now() + 30_000).catch(() => undefined);
    }
  }
}

/** Settle the tracked worker submission in storage once it is terminal. */
async function syncWorkerTask(context: Ctx, harness: Harness): Promise<void> {
  const record = await context.storage.get<WorkerTaskRecord>(TASK_KEY);
  if (record?.status !== "running" || record.submissionId === undefined) {
    return;
  }
  const submission = await harness.submission(record.submissionId, BACKGROUND_CONTEXT).catch(() => undefined);
  if (submission === undefined) {
    await context.storage.put<WorkerTaskRecord>(TASK_KEY, {
      status: "failed",
      error: "submission was lost",
      updatedAt: Date.now(),
    });
    return;
  }
  const status = await submission.status(BACKGROUND_CONTEXT).catch(() => undefined);
  if (status === undefined) {
    return;
  }
  if (status.status === "done") {
    await context.storage.put<WorkerTaskRecord>(TASK_KEY, { status: "done", updatedAt: Date.now() });
  } else if (status.status === "unanswered") {
    await context.storage.put<WorkerTaskRecord>(TASK_KEY, {
      status: "failed",
      error: `run ended without an answer (${status.reason})`,
      updatedAt: Date.now(),
    });
  }
}

/**
 * One container-mode pump iteration, re-armed while the task runs. Unknown
 * failures get bounded retries, then the task fails loudly (never a silent
 * hang). A reentrancy guard collapses duplicate alarms (at-least-once
 * delivery) into the in-flight iteration: the in-flight one re-arms, so
 * skipping is safe.
 */
async function agentPump(context: Ctx): Promise<void> {
  const entry = entryFor(context.storage);
  if (entry.pumpRunning) {
    return;
  }
  entry.pumpRunning = true;
  try {
    const outcome = await pumpAgentOnce({
      now: Date.now,
      client: createAgentServerClient(sandboxClient(context)),
      store: {
        loadTask: async () => (await context.storage.get<ContainerTaskRecord>(CTASK_KEY)) ?? null,
        saveTask: (task) => context.storage.put(CTASK_KEY, task),
        appendMirror: (text) => appendMirror(context, text),
      },
      model: { answer: (request) => answerBrokerRequest(context, request) },
      pollSeconds: DO_PUMP_POLL_SECONDS,
    });
    if (outcome.action === "continue") {
      await context.setAlarm(Date.now());
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`agentPump failed: ${message}`);
    const task = await context.storage.get<ContainerTaskRecord>(CTASK_KEY).catch(() => null);
    if (task?.status !== "starting" && task?.status !== "running") {
      return;
    }
    const retries = (task.pumpRetries ?? 0) + 1;
    if (retries <= 5) {
      await context.storage
        .put<ContainerTaskRecord>(CTASK_KEY, { ...task, pumpRetries: retries, updatedAt: Date.now() })
        .catch(() => undefined);
      await context.setAlarm(Date.now() + 30_000).catch(() => undefined);
    } else {
      await context.storage
        .put<ContainerTaskRecord>(CTASK_KEY, {
          ...task,
          status: "failed",
          text: undefined,
          error: `agent pump error: ${message}`,
          updatedAt: Date.now(),
        })
        .catch(() => undefined);
    }
  } finally {
    entry.pumpRunning = false;
  }
}

/**
 * The single alarm hook: clone pump first (nothing else can be pending
 * while a clone runs), then the runtime's pump. Every branch is idempotent
 * and re-arms while its work remains.
 */
async function alarm(context: Ctx): Promise<void> {
  if (context.state.name === "") {
    return;
  }
  const repo = await context.storage.get<RepositoryRecord>(REPO_KEY);
  if (repo?.status === "cloning") {
    await repositoryPump(context);
    return;
  }
  if (agentRuntime(context.env.AGENT_RUNTIME) === "container") {
    await agentPump(context);
  } else {
    await harnessWake(context);
  }
}

// ------------------------------------------------------------------
// RPC: state + diff (read-only; state never starts the container).
// ------------------------------------------------------------------

async function getSandboxState(
  context: Ctx
): Promise<{ ok: true; state: SandboxState } | { ok: false; code: string; message: string }> {
  try {
    const runtime = agentRuntime(context.env.AGENT_RUNTIME);
    const stored = await context.storage.get<RepositoryRecord>(REPO_KEY);
    const repository: SandboxState["repository"] =
      stored === null || stored === undefined
        ? { status: "idle" }
        : {
            ...(stored.url === undefined ? {} : { url: stored.url }),
            ...(stored.ref === undefined ? {} : { ref: stored.ref }),
            ...(stored.commit === undefined ? {} : { commit: stored.commit }),
            status: stored.status,
            ...(stored.error === undefined ? {} : { error: stored.error }),
          };
    if (runtime === "container") {
      const task = await context.storage.get<ContainerTaskRecord>(CTASK_KEY);
      const mirror = await context.storage.get<MirrorRecord>(MIRROR_KEY);
      const status: TaskStatus =
        task?.status === "starting" || task?.status === "running" ? "running" : (task?.status ?? "idle");
      return {
        ok: true,
        state: {
          runtime,
          busy: status === "running",
          model: context.env.MODEL ?? "",
          repository,
          task: { status, ...(task?.error === undefined ? {} : { error: task.error }) },
          transcript: mirror?.text ?? "",
          ...(mirror?.truncated === true ? { mirrorTruncated: true as const } : {}),
        },
      };
    }
    const tracked = await context.storage.get<WorkerTaskRecord>(TASK_KEY);
    const ready = await ensureReady(context);
    if (!ready.ok) {
      // Degraded but useful: repo + tracked task without the transcript.
      return {
        ok: true,
        state: {
          runtime,
          busy: false,
          model: context.env.MODEL ?? "",
          repository,
          task: {
            status: tracked?.status ?? "idle",
            ...(tracked?.error === undefined ? {} : { error: tracked.error }),
          },
          transcript: "",
          initError: ready.message,
        },
      };
    }
    // Self-healing read: a settled-but-unsynced run settles now, even if
    // no wake has fired since it finished.
    await syncWorkerTask(context, ready.ready.harness);
    const synced = (await context.storage.get<WorkerTaskRecord>(TASK_KEY)) ?? tracked;
    const root = await ready.ready.harness.root(BACKGROUND_CONTEXT);
    const transcript = await renderTail(root, TRANSCRIPT_TAIL);
    const agent = await root.agent(BACKGROUND_CONTEXT).catch(() => undefined);
    const model =
      agent?.model !== undefined ? `${agent.model.provider}/${agent.model.modelId}` : (context.env.MODEL ?? "");
    // Busy comes from durable harness state, not an instance field: it
    // survives eviction (open recovery marks active work).
    const busy = ready.ready.harness.wake().active;
    return {
      ok: true,
      state: {
        runtime,
        busy,
        model,
        repository,
        task: {
          status: synced?.status ?? "idle",
          ...(synced?.error === undefined ? {} : { error: synced.error }),
        },
        transcript: transcript.text,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, code: "internal", message };
  }
}

/**
 * git status + diff of the sandbox checkout. No model calls, no harness
 * needed. `no_repository` (never cloned) vs `git_failed` (clone failed or
 * git broke) are distinct codes.
 */
async function getDiff(context: Ctx, name: string): Promise<DiffResult> {
  context.state.name = name;
  const repository = await context.storage.get<RepositoryRecord>(REPO_KEY);
  if (repository === null || repository === undefined) {
    return { ok: false, code: "no_repository", message: "no repository cloned yet" };
  }
  if (repository.status === "cloning") {
    return { ok: false, code: "repo_busy", message: "repository clone in progress" };
  }
  if (repository.status === "failed") {
    return { ok: false, code: "git_failed", message: repository.error ?? "last clone failed" };
  }
  // Ephemeral-container recovery, as before a task: diffing a vanished
  // checkout reports the fresh tree, not a stale failure.
  const deps = createCloneDeps(sandboxClient(context));
  const ensured = await ensureCheckout(repoStore(context), deps, context.env.REPO_HOSTS);
  if (!ensured.ok) {
    return { ok: false, code: "git_failed", message: ensured.message };
  }
  try {
    const status = await deps.exec("git status --short", { cwd: REPO_DIR, timeout: GIT_TIMEOUT });
    const stat = await deps.exec("git diff --stat", { cwd: REPO_DIR, timeout: GIT_TIMEOUT });
    const diff = await deps.exec("git diff", { cwd: REPO_DIR, timeout: GIT_TIMEOUT });
    if (!status.success || !stat.success || !diff.success) {
      const failed = !status.success ? status : !stat.success ? stat : diff;
      return {
        ok: false,
        code: "git_failed",
        message: truncateText(failed.stderr || failed.stdout || "git command failed"),
      };
    }
    return {
      ok: true,
      ...(repository.commit === undefined ? {} : { commit: repository.commit }),
      status: truncateText(status.stdout),
      stat: truncateText(stat.stdout),
      diff: truncateText(diff.stdout, TRANSCRIPT_CAP),
    };
  } catch (error) {
    const described = describeContainerError(error);
    return { ok: false, code: "git_failed", message: `${described.code}: ${described.message}` };
  }
}

// ------------------------------------------------------------------
// Container-mode DO side: transcript mirror + model brokering.
// ------------------------------------------------------------------

async function appendMirror(context: Ctx, text: string): Promise<void> {
  const current = (await context.storage.get<MirrorRecord>(MIRROR_KEY)) ?? { text: "", truncated: false };
  let next = current.text === "" ? text : `${current.text}\n${text}`;
  let truncated = current.truncated;
  if (next.length > MIRROR_CAP) {
    next = next.slice(-MIRROR_CAP);
    truncated = true;
  }
  await context.storage.put<MirrorRecord>(MIRROR_KEY, { text: next, truncated });
}

/**
 * Answer one brokered model request with the real provider (or faux). Runs
 * entirely DO-side: the key never crosses into the container.
 */
async function answerBrokerRequest(context: Ctx, request: ModelRequestPayload): Promise<ModelAnswerOutcome> {
  const ready = await ensureReady(context);
  if (!ready.ok) {
    return { kind: "error", error: ready.message };
  }
  const checked = checkModel(context, ready.ready);
  if (!checked.ok) {
    return { kind: "misconfigured", message: checked.message };
  }
  const options: { temperature?: number; maxTokens?: number } = {
    ...(request.options.temperature === undefined ? {} : { temperature: request.options.temperature }),
    ...(request.options.maxTokens === undefined ? {} : { maxTokens: request.options.maxTokens }),
  };
  try {
    if (checked.selection.kind === "faux") {
      topUpFaux(context, ready.ready.faux);
      const model = ready.ready.faux.getModel();
      const message = await ready.ready.models.completeSimple(model, { messages: request.messages }, options);
      return { kind: "message", message };
    }
    const model = ready.ready.models.getModel(OPENAI_PROVIDER, checked.selection.modelId);
    if (model === undefined) {
      return {
        kind: "misconfigured",
        message: `Model "${checked.selection.modelId}" is not in the OpenAI catalog (custom endpoints accept any id).`,
      };
    }
    const message: AssistantMessage = await ready.ready.models.completeSimple(
      model,
      { messages: request.messages },
      options
    );
    return { kind: "message", message };
  } catch (error) {
    return { kind: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

export const Agent = defineDurableState({
  initialState: { name: "" },
  methods: {
    startRepository,
    startTask,
    getSandboxState,
    getDiff,
  },
  alarm,
});

export default Agent;
