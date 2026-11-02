import { Sandbox } from "@cloudflare/sandbox";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  Type,
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
  type FauxProviderHandle,
} from "@earendil-works/pi-ai/providers/faux";
import {
  ConversationBusy,
  Harness,
  createRegistry,
  defineExtension,
  defineTool,
  section,
  type Conversation,
  type EntryId,
  type SubmissionId,
} from "@earendil-works/pi-durable";
import { openDurableObjectSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/cloudflare";

import { agentServerSource } from "./container/embedded";
import {
  PumpError,
  pumpAgentOnce,
  type AgentServerClient,
  type ContainerTaskRecord,
  type ModelAnswerOutcome,
} from "./container-pump";
import type { Env } from "./env";
import { describeContainerError } from "./errors";
import { agentRuntime, OPENAI_PROVIDER, parseModelRef, withEndpointModels, type ModelSelection } from "./model";
import { REPO_DIR, resolveRepoPath, shellQuote } from "./paths";
import {
  AGENT_SERVER_PATH,
  AGENT_SERVER_PORT,
  AGENT_SERVER_PROCESS_ID,
  parseEventsResponse,
  type EventsResponse,
  type ModelAnswer,
  type ModelRequestPayload,
} from "./protocol";
import { classifyRef, parseRepoHosts, validateRepositoryUrl, validRef } from "./repo-url";
import { extractLastUserText, renderMessages, truncateText } from "./transcript";

/**
 * Pi Durable agent in a Worker Durable Object. One named sandbox is one
 * object: durable state lives in the object's SQLite storage, and the
 * Sandbox container it supervises is the tool backend.
 *
 * Two runtimes (AGENT_RUNTIME): "worker" (default) runs the harness in the
 * DO with tools exec'ing in the container; "container" runs the whole agent
 * loop as a process in the container, with model calls brokered by the DO
 * so the API key never enters the container.
 *
 * Alarm composition: this class deliberately has NO alarm() override.
 * `Container.alarm()` (super) owns the DO alarm — its sleepAfter loop and
 * its `container_schedules` table. Every background wakeup here goes
 * through `this.schedule()`, which inserts a due row that super.alarm()
 * executes and deletes; direct setAlarm/deleteAlarm calls would clobber
 * the container's own schedule and are never used. Rows are durable, so a
 * pump chain survives DO eviction, and rows execute at-least-once (they
 * are deleted after the callback returns), so every callback is idempotent.
 */

const REPO_KEY = "agent:repo";
const TASK_KEY = "agent:task";
const CTASK_KEY = "agent:ctask";
const MIRROR_KEY = "agent:cmirror";
const TRANSCRIPT_TAIL = 50;
const TRANSCRIPT_CAP = 32_768;
const MIRROR_CAP = 131_072;

/** Model calls have no deadline of their own; tool execs do. */
const EXEC_TIMEOUT_DEFAULT = 60_000;
const EXEC_TIMEOUT_MAX = 300_000;
const EXEC_OUTPUT_CAP = 8000;
const GIT_TIMEOUT = 60_000;
const CLONE_TIMEOUT = 120_000;
/** How long one harnessWake invocation drives the run before re-arming. */
const WAKE_DRIVE_MS = 20_000;

export const MODEL_SETUP_MESSAGE =
  "No model is configured. Set OPENAI_API_KEY and MODEL in Noite Settings -> Environment and redeploy " +
  "(OPENAI_BASE_URL selects any OpenAI-compatible endpoint, default api.openai.com); " +
  "MODEL=faux runs a cred-less test loop.";

export type RepositoryStatus = "cloning" | "ready" | "failed";

export interface RepositoryRecord {
  url: string;
  ref?: string;
  commit?: string;
  status: RepositoryStatus;
  error?: string;
}

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

export class AgentSandbox extends Sandbox<Env> {
  readonly #ctx: DurableObjectState<{}>;
  readonly #env: Env;
  #harness: Harness | undefined = undefined;
  #models: MutableModels | undefined = undefined;
  #faux: FauxProviderHandle | undefined = undefined;
  #ready: Promise<void> | null = null;
  #initError: string | null = null;
  #wakeFailures = 0;
  #pumpRunning = false;

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    this.#ctx = ctx;
    this.#env = env;
    // Eager init, gated on blockConcurrencyWhile so no RPC or alarm runs
    // before the harness is open (or has failed to open).
    void this.#ensureInit().catch(() => undefined);
  }

  /**
   * Start (or join) harness init. A failed init resets, so the next call
   * retries on a fresh attempt instead of pinning the failure.
   */
  #ensureInit(): Promise<void> {
    if (this.#ready === null) {
      this.#ready = this.#ctx.blockConcurrencyWhile(async () => {
        this.#initError = null;
        try {
          await this.#init();
        } catch (error) {
          this.#initError = error instanceof Error ? error.message : String(error);
          this.#ready = null;
          throw error;
        }
      });
    }
    return this.#ready;
  }

  async #readyState(): Promise<{ ok: true; ready: Ready } | { ok: false; message: string }> {
    if (this.#harness !== undefined && this.#models !== undefined && this.#faux !== undefined) {
      return { ok: true, ready: { harness: this.#harness, models: this.#models, faux: this.#faux } };
    }
    try {
      await this.#ensureInit();
    } catch {
      // Fall through to the field check: it reports the stored error.
    }
    if (this.#harness !== undefined && this.#models !== undefined && this.#faux !== undefined) {
      return { ok: true, ready: { harness: this.#harness, models: this.#models, faux: this.#faux } };
    }
    return { ok: false, message: this.#initError ?? "harness failed to open" };
  }

  // ------------------------------------------------------------------
  // RPC: repository (async; no harness needed, so cloning works before the
  // model is configured and while the harness is broken).
  // ------------------------------------------------------------------

  /** Validate, durably record a clone/refresh op, and return at once; the
   * scheduled repositoryPump performs it in the background. */
  async startRepository(url: string, ref?: string): Promise<StartResult> {
    const hosts = parseRepoHosts(this.#env.REPO_HOSTS);
    const valid = validateRepositoryUrl(url, hosts);
    if (!valid.ok) {
      return { ok: false, code: "invalid_repository", message: valid.message };
    }
    if (ref !== undefined && !validRef(ref)) {
      return { ok: false, code: "invalid_ref", message: "invalid ref" };
    }
    // Serialized: two concurrent starters must not both pass the busy check.
    return this.#ctx.blockConcurrencyWhile(async (): Promise<StartResult> => {
      const existing = await this.#ctx.storage.get<RepositoryRecord>(REPO_KEY);
      if (existing?.status === "cloning") {
        return { ok: false, code: "repo_busy", message: "a repository clone is already in progress" };
      }
      const record: RepositoryRecord = {
        url: valid.normalized,
        ...(ref === undefined ? {} : { ref }),
        status: "cloning",
      };
      try {
        await this.#ctx.storage.put<RepositoryRecord>(REPO_KEY, record);
        await this.schedule(0, "repositoryPump");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.#ctx.storage
          .put<RepositoryRecord>(REPO_KEY, { ...record, status: "failed", error: message })
          .catch(() => undefined);
        return { ok: false, code: "submit_failed", message };
      }
      return { ok: true };
    });
  }

  /** Scheduled callback: perform the recorded clone/refresh. Idempotent:
   * it only acts while the record still says `cloning`. */
  async repositoryPump(): Promise<void> {
    try {
      const record = await this.#ctx.storage.get<RepositoryRecord>(REPO_KEY);
      if (record?.status !== "cloning") {
        return;
      }
      const result = await this.#doClone(record.url, record.ref);
      if ("error" in result) {
        await this.#ctx.storage.put<RepositoryRecord>(REPO_KEY, {
          url: record.url,
          ...(record.ref === undefined ? {} : { ref: record.ref }),
          status: "failed",
          error: result.error,
        });
      } else {
        await this.#ctx.storage.put<RepositoryRecord>(REPO_KEY, {
          url: record.url,
          ...(record.ref === undefined ? {} : { ref: record.ref }),
          ...(result.commit === undefined ? {} : { commit: result.commit }),
          status: "ready",
        });
      }
    } catch (error) {
      // Unexpected (a bug): never leave the record stuck on `cloning`.
      const record = await this.#ctx.storage.get<RepositoryRecord>(REPO_KEY).catch(() => null);
      if (record?.status === "cloning") {
        const message = error instanceof Error ? error.message : String(error);
        await this.#ctx.storage
          .put<RepositoryRecord>(REPO_KEY, { ...record, status: "failed", error: message })
          .catch(() => undefined);
      }
    }
  }

  async #doClone(url: string, ref?: string): Promise<{ commit?: string } | { error: string }> {
    const classification = ref === undefined ? undefined : classifyRef(ref);
    if (ref !== undefined && (classification === undefined || classification.kind === "invalid")) {
      return { error: "invalid ref" };
    }
    try {
      const marker = await this.exists(`${REPO_DIR}/.git`);
      // Ground truth wins over storage: a checkout whose origin differs
      // from the requested URL is wiped and re-cloned.
      let fresh = !marker.exists;
      if (!fresh) {
        const origin = await this.exec("git config --get remote.origin.url", {
          cwd: REPO_DIR,
          timeout: GIT_TIMEOUT,
        });
        if (!origin.success || origin.stdout.trim() !== url) {
          fresh = true;
        }
      }
      if (fresh) {
        if (marker.exists) {
          const wiped = await this.exec(`rm -rf ${shellQuote(REPO_DIR)}`, { timeout: GIT_TIMEOUT });
          if (!wiped.success) {
            return { error: `could not clear the old checkout: ${truncateText(wiped.stderr || wiped.stdout)}` };
          }
        }
        const checkout = await this.gitCheckout(url, {
          targetDir: REPO_DIR,
          depth: 1,
          cloneTimeoutMs: CLONE_TIMEOUT,
          // SHAs are fetched explicitly below; only branches/tags go here.
          ...(classification?.kind === "branch" ? { branch: classification.ref } : {}),
        });
        if (!checkout.success) {
          return { error: `clone failed (exit ${checkout.exitCode ?? "?"})` };
        }
      }
      if (classification?.kind === "sha") {
        const fetched = await this.exec(`git fetch --depth 1 origin ${classification.sha}`, {
          cwd: REPO_DIR,
          timeout: GIT_TIMEOUT,
        });
        if (!fetched.success) {
          return {
            error:
              `could not fetch SHA ${classification.sha.slice(0, 12)} ` +
              `(the server must allow fetching arbitrary SHAs): ${truncateText(fetched.stderr || fetched.stdout)}`,
          };
        }
        const checked = await this.exec(`git checkout --detach ${classification.sha}`, {
          cwd: REPO_DIR,
          timeout: GIT_TIMEOUT,
        });
        if (!checked.success) {
          return { error: truncateText(checked.stderr || checked.stdout) };
        }
      } else if (classification?.kind === "branch" && !fresh) {
        const fetched = await this.exec(`git fetch --depth 1 origin ${classification.ref}`, {
          cwd: REPO_DIR,
          timeout: GIT_TIMEOUT,
        });
        if (!fetched.success) {
          return { error: truncateText(fetched.stderr || fetched.stdout) };
        }
        const checked = await this.exec(`git checkout ${classification.ref}`, {
          cwd: REPO_DIR,
          timeout: GIT_TIMEOUT,
        });
        if (!checked.success) {
          return { error: truncateText(checked.stderr || checked.stdout) };
        }
      }
      const head = await this.exec("git rev-parse HEAD", { cwd: REPO_DIR, timeout: GIT_TIMEOUT });
      const commit = head.success ? head.stdout.trim() || undefined : undefined;
      if (commit === undefined) {
        return {};
      }
      return { commit };
    } catch (error) {
      const described = describeContainerError(error);
      return { error: `${described.code}: ${described.message}` };
    }
  }

  // ------------------------------------------------------------------
  // RPC: task (async in both runtimes; 202 semantics live in index.ts).
  // ------------------------------------------------------------------

  /** Durably admit one task and return at once; background work (the
   * harness in worker mode, the agentPump chain in container mode)
   * performs it. Concurrent submissions are refused with `task_busy`
   * (pi-durable `whenBusy: "reject"` in worker mode, a record check in
   * container mode): one run at a time per sandbox. */
  async startTask(text: string): Promise<StartResult> {
    if (text.trim() === "" || text.length > 20_000) {
      return { ok: false, code: "invalid_task", message: "task text is required (max 20000 chars)" };
    }
    if (agentRuntime(this.#env.AGENT_RUNTIME) === "container") {
      return this.#startContainerTask(text);
    }
    return this.#startWorkerTask(text);
  }

  async #startWorkerTask(text: string): Promise<StartResult> {
    const ready = await this.#readyState();
    if (!ready.ok) {
      return { ok: false, code: "init_failed", message: ready.message };
    }
    const repository = await this.#ctx.storage.get<RepositoryRecord>(REPO_KEY);
    if (repository?.status === "cloning") {
      return { ok: false, code: "repo_busy", message: "repository clone in progress; wait for it to finish" };
    }
    const resolved = await this.#resolveConversation(ready.ready);
    if (!resolved.ok) {
      return { ok: false, code: resolved.code, message: resolved.message };
    }
    try {
      const submission = await resolved.root.submit(
        { type: "input", content: text, whenBusy: "reject" },
        BACKGROUND_CONTEXT
      );
      try {
        await this.#ctx.storage.put<WorkerTaskRecord>(TASK_KEY, {
          status: "running",
          submissionId: submission.id,
          updatedAt: Date.now(),
        });
        // The run starts in this invocation, but the response goes out now;
        // this row keeps it progressing after the response (and revives it
        // after an eviction).
        await this.schedule(0, "harnessWake");
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

  async #startContainerTask(text: string): Promise<StartResult> {
    const repository = await this.#ctx.storage.get<RepositoryRecord>(REPO_KEY);
    if (repository?.status === "cloning") {
      return { ok: false, code: "repo_busy", message: "repository clone in progress; wait for it to finish" };
    }
    // Fail fast on a broken harness or missing model: the pump would only
    // fail the task with the same message after a 202.
    const ready = await this.#readyState();
    if (!ready.ok) {
      return { ok: false, code: "init_failed", message: ready.message };
    }
    const checked = this.#checkModel(ready.ready);
    if (!checked.ok) {
      return { ok: false, code: checked.code, message: checked.message };
    }
    // Serialized: two concurrent starters must not both pass the busy check.
    return this.#ctx.blockConcurrencyWhile(async (): Promise<StartResult> => {
      const existing = await this.#ctx.storage.get<ContainerTaskRecord>(CTASK_KEY);
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
        await this.#ctx.storage.put<ContainerTaskRecord>(CTASK_KEY, record);
        await this.#ctx.storage.put<MirrorRecord>(MIRROR_KEY, { text: "", truncated: false });
        await this.schedule(0, "agentPump");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.#ctx.storage
          .put<ContainerTaskRecord>(CTASK_KEY, { ...record, status: "failed", text: undefined, error: message })
          .catch(() => undefined);
        return { ok: false, code: "submit_failed", message };
      }
      return { ok: true };
    });
  }

  /**
   * Scheduled callback: drive the worker harness. Resume, run until idle
   * or the drive budget, sync the tracked submission, then re-arm while
   * work remains (immediately when active, at the sleep deadline when
   * only a sleep is pending, not at all when idle). Unknown failures get
   * bounded retries, then the chain stops: the next user RPC retries,
   * and an evicted instance recovers via open + onWake.
   */
  async harnessWake(): Promise<void> {
    try {
      const ready = await this.#readyState();
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
      await this.#syncWorkerTask(ready.ready.harness);
      const wake = ready.ready.harness.wake();
      if (wake.active) {
        // Ordinary work pending (the tracked run is unsettled): continue
        // immediately. Background-only activity (e.g. a compaction task,
        // which waitForIdle does not cover): poll slowly instead of
        // tight-looping alarms. A new submit always arms its own row.
        const tracked = await this.#ctx.storage.get<WorkerTaskRecord>(TASK_KEY);
        await this.schedule(tracked?.status === "running" ? 0 : 10, "harnessWake");
      } else if (wake.at !== undefined) {
        await this.schedule(new Date(wake.at), "harnessWake");
      }
      this.#wakeFailures = 0;
    } catch (error) {
      this.#wakeFailures += 1;
      console.error(
        `harnessWake failed (${this.#wakeFailures}): ${error instanceof Error ? error.message : String(error)}`
      );
      if (this.#wakeFailures < 3) {
        await this.schedule(30, "harnessWake").catch(() => undefined);
      }
    }
  }

  /** Settle the tracked worker submission in storage once it is terminal. */
  async #syncWorkerTask(harness: Harness): Promise<void> {
    const record = await this.#ctx.storage.get<WorkerTaskRecord>(TASK_KEY);
    if (record?.status !== "running" || record.submissionId === undefined) {
      return;
    }
    const submission = await harness.submission(record.submissionId, BACKGROUND_CONTEXT).catch(() => undefined);
    if (submission === undefined) {
      await this.#ctx.storage.put<WorkerTaskRecord>(TASK_KEY, {
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
      await this.#ctx.storage.put<WorkerTaskRecord>(TASK_KEY, { status: "done", updatedAt: Date.now() });
    } else if (status.status === "unanswered") {
      await this.#ctx.storage.put<WorkerTaskRecord>(TASK_KEY, {
        status: "failed",
        error: `run ended without an answer (${status.reason})`,
        updatedAt: Date.now(),
      });
    }
  }

  /** Scheduled callback: one container-mode pump iteration, re-armed while
   * the task runs. Unknown failures get bounded retries, then the task
   * fails loudly (never a silent hang). A reentrancy guard collapses
   * duplicate rows (at-least-once delivery) into the in-flight iteration:
   * the in-flight one re-arms, so skipping is safe. */
  async agentPump(): Promise<void> {
    if (this.#pumpRunning) {
      return;
    }
    this.#pumpRunning = true;
    try {
      const outcome = await pumpAgentOnce({
        now: Date.now,
        client: this.#serverClient(),
        store: {
          loadTask: async () => (await this.#ctx.storage.get<ContainerTaskRecord>(CTASK_KEY)) ?? null,
          saveTask: (task) => this.#ctx.storage.put(CTASK_KEY, task),
          appendMirror: (text) => this.#appendMirror(text),
        },
        model: { answer: (request) => this.#answerBrokerRequest(request) },
      });
      if (outcome.action === "continue") {
        await this.schedule(0, "agentPump");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`agentPump failed: ${message}`);
      const task = await this.#ctx.storage.get<ContainerTaskRecord>(CTASK_KEY).catch(() => null);
      if (task?.status !== "starting" && task?.status !== "running") {
        return;
      }
      const retries = (task.pumpRetries ?? 0) + 1;
      if (retries <= 5) {
        await this.#ctx.storage
          .put<ContainerTaskRecord>(CTASK_KEY, { ...task, pumpRetries: retries, updatedAt: Date.now() })
          .catch(() => undefined);
        await this.schedule(30, "agentPump").catch(() => undefined);
      } else {
        await this.#ctx.storage
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
      this.#pumpRunning = false;
    }
  }

  // ------------------------------------------------------------------
  // RPC: state + diff (read-only; never start the container, never wait).
  // ------------------------------------------------------------------

  async getSandboxState(): Promise<{ ok: true; state: SandboxState } | { ok: false; code: string; message: string }> {
    try {
      const runtime = agentRuntime(this.#env.AGENT_RUNTIME);
      const stored = await this.#ctx.storage.get<RepositoryRecord>(REPO_KEY);
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
        const task = await this.#ctx.storage.get<ContainerTaskRecord>(CTASK_KEY);
        const mirror = await this.#ctx.storage.get<MirrorRecord>(MIRROR_KEY);
        const status: TaskStatus =
          task?.status === "starting" || task?.status === "running"
            ? "running"
            : (task?.status ?? "idle");
        return {
          ok: true,
          state: {
            runtime,
            busy: status === "running",
            model: this.#env.MODEL ?? "",
            repository,
            task: { status, ...(task?.error === undefined ? {} : { error: task.error }) },
            transcript: mirror?.text ?? "",
            ...(mirror?.truncated === true ? { mirrorTruncated: true as const } : {}),
          },
        };
      }
      const tracked = await this.#ctx.storage.get<WorkerTaskRecord>(TASK_KEY);
      const ready = await this.#readyState();
      if (!ready.ok) {
        // Degraded but useful: repo + tracked task without the transcript.
        return {
          ok: true,
          state: {
            runtime,
            busy: false,
            model: this.#env.MODEL ?? "",
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
      await this.#syncWorkerTask(ready.ready.harness);
      const synced = (await this.#ctx.storage.get<WorkerTaskRecord>(TASK_KEY)) ?? tracked;
      const root = await ready.ready.harness.root(BACKGROUND_CONTEXT);
      const transcript = await this.#renderTail(root, TRANSCRIPT_TAIL);
      const agent = await root.agent(BACKGROUND_CONTEXT).catch(() => undefined);
      const model =
        agent?.model !== undefined ? `${agent.model.provider}/${agent.model.modelId}` : (this.#env.MODEL ?? "");
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

  /** git status + diff of the container checkout. No model calls, no
   * harness needed. `no_repository` (never cloned) vs `git_failed`
   * (clone failed or git broke) are distinct codes. */
  async getDiff(): Promise<DiffResult> {
    const repository = await this.#ctx.storage.get<RepositoryRecord>(REPO_KEY);
    if (repository === null || repository === undefined) {
      return { ok: false, code: "no_repository", message: "no repository cloned yet" };
    }
    if (repository.status === "cloning") {
      return { ok: false, code: "repo_busy", message: "repository clone in progress" };
    }
    if (repository.status === "failed") {
      return { ok: false, code: "git_failed", message: repository.error ?? "last clone failed" };
    }
    try {
      const status = await this.exec("git status --short", { cwd: REPO_DIR, timeout: GIT_TIMEOUT });
      const stat = await this.exec("git diff --stat", { cwd: REPO_DIR, timeout: GIT_TIMEOUT });
      const diff = await this.exec("git diff", { cwd: REPO_DIR, timeout: GIT_TIMEOUT });
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
  // Container-mode DO side: server lifecycle + model brokering.
  // ------------------------------------------------------------------

  #serverClient(): AgentServerClient {
    return {
      ensureUp: () => this.#serverEnsureUp(),
      submit: (text) => this.#serverSubmit(text),
      events: (after, waitSeconds) => this.#serverEvents(after, waitSeconds),
      answer: (id, answer) => this.#serverAnswer(id, answer),
      abort: () => this.#serverAbort(),
    };
  }

  async #serverFetch(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    return this.containerFetch(
      `http://127.0.0.1:${AGENT_SERVER_PORT}${path}`,
      { ...init, signal: AbortSignal.timeout(timeoutMs) },
      AGENT_SERVER_PORT
    );
  }

  /** Probe the server; write + (re)start it when two probes fail. */
  async #serverEnsureUp(): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const probe = await this.#serverFetch("/health", { method: "GET" }, 5_000);
        if (probe.ok) {
          return;
        }
      } catch {
        // Fall through to the restart below.
      }
    }
    let source: string;
    try {
      source = agentServerSource();
    } catch (error) {
      throw new PumpError("server_start_failed", error instanceof Error ? error.message : String(error));
    }
    try {
      await this.writeFile(AGENT_SERVER_PATH, source);
    } catch (error) {
      const described = describeContainerError(error);
      throw new PumpError("server_start_failed", `could not write the agent server: ${described.message}`);
    }
    // A stale process record (or a half-dead server) must not block the
    // fixed process id; killing a healthy server here is harmless because
    // the pump fails the task on the boot-id change anyway.
    await this.killProcess(AGENT_SERVER_PROCESS_ID).catch(() => undefined);
    try {
      const proc = await this.startProcess(`node ${AGENT_SERVER_PATH}`, {
        processId: AGENT_SERVER_PROCESS_ID,
      });
      await proc.waitForPort(AGENT_SERVER_PORT, { path: "/health", status: 200, timeout: 60_000 });
    } catch (error) {
      const described = describeContainerError(error);
      throw new PumpError("server_start_failed", `${described.code}: ${described.message}`);
    }
  }

  async #serverSubmit(text: string): Promise<{ bootId: string }> {
    let res: Response;
    try {
      res = await this.#serverFetch("/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      }, 30_000);
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

  async #serverEvents(after: number, waitSeconds: number): Promise<EventsResponse> {
    let res: Response;
    try {
      res = await this.#serverFetch(`/events?after=${after}&wait=${waitSeconds}`, { method: "GET" }, (waitSeconds + 10) * 1000);
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

  async #serverAnswer(id: string, answer: ModelAnswer): Promise<"ok" | "unknown"> {
    let res: Response;
    try {
      res = await this.#serverFetch(`/model/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(answer),
      }, 15_000);
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

  async #serverAbort(): Promise<void> {
    try {
      await this.#serverFetch("/tasks", { method: "DELETE" }, 10_000);
    } catch {
      // Best-effort only.
    }
  }

  async #appendMirror(text: string): Promise<void> {
    const current = (await this.#ctx.storage.get<MirrorRecord>(MIRROR_KEY)) ?? { text: "", truncated: false };
    let next = current.text === "" ? text : `${current.text}\n${text}`;
    let truncated = current.truncated;
    if (next.length > MIRROR_CAP) {
      next = next.slice(-MIRROR_CAP);
      truncated = true;
    }
    await this.#ctx.storage.put<MirrorRecord>(MIRROR_KEY, { text: next, truncated });
  }

  /** Answer one brokered model request with the real provider (or faux).
   * Runs entirely DO-side: the key never crosses into the container. */
  async #answerBrokerRequest(request: ModelRequestPayload): Promise<ModelAnswerOutcome> {
    const ready = await this.#readyState();
    if (!ready.ok) {
      return { kind: "error", error: ready.message };
    }
    const checked = this.#checkModel(ready.ready);
    if (!checked.ok) {
      return { kind: "misconfigured", message: checked.message };
    }
    const options: { temperature?: number; maxTokens?: number } = {
      ...(request.options.temperature === undefined ? {} : { temperature: request.options.temperature }),
      ...(request.options.maxTokens === undefined ? {} : { maxTokens: request.options.maxTokens }),
    };
    try {
      if (checked.selection.kind === "faux") {
        this.#topUpFaux(ready.ready.faux);
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

  // ------------------------------------------------------------------
  // Harness setup + worker-mode tools.
  // ------------------------------------------------------------------

  async #init(): Promise<void> {
    const authContext: AuthContext = {
      env: async (name) => {
        // pi-ai's OpenAI auth reads OPENAI_API_KEY; serve it from the app
        // env vars so the token stays in Worker env, never in code.
        if (name === "OPENAI_API_KEY") {
          return nonEmpty(this.#env.OPENAI_API_KEY);
        }
        return undefined;
      },
      fileExists: async () => false,
    };
    const models = createModels({ authContext });
    const openai = openaiProvider();
    // Any OpenAI-compatible endpoint works (OpenAI, Azure, Ollama, vLLM,
    // OpenRouter, AI Gateway's /openai route, ...); see withEndpointModels.
    const endpoint = nonEmpty(this.#env.OPENAI_BASE_URL);
    const selected = parseModelRef(this.#env.MODEL);
    models.setProvider(
      withEndpointModels(openai, endpoint, selected.kind === "openai" ? selected.modelId : "")
    );
    const faux = fauxProvider();
    models.setProvider(faux.provider);
    this.#models = models;
    this.#faux = faux;

    const execTool = defineTool({
      name: "exec",
      description: `Run a shell command in the sandbox container in ${REPO_DIR}. Returns stdout, stderr, and the exit code.`,
      parameters: Type.Object({
        command: Type.String({ description: "Shell command to run." }),
        timeoutMs: Type.Optional(Type.Number({ description: "Kill the command after this many ms (default 60000, max 300000)." })),
      }),
      execute: async (args) => {
        const timeoutMs =
          args.timeoutMs === undefined || !Number.isFinite(args.timeoutMs)
            ? EXEC_TIMEOUT_DEFAULT
            : Math.max(1000, Math.min(EXEC_TIMEOUT_MAX, Math.floor(args.timeoutMs)));
        try {
          // cwd is always the repo dir server-side: the tool takes no cwd
          // parameter, so commands cannot stray by accident.
          const result = await this.exec(args.command, { cwd: REPO_DIR, timeout: timeoutMs });
          const text = truncateText(
            `$ ${args.command}\nexit ${result.exitCode}\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`,
            EXEC_OUTPUT_CAP
          );
          return {
            output: [{ type: "text" as const, text }],
            ...(result.success ? {} : { isError: true as const }),
          };
        } catch (error) {
          const described = describeContainerError(error);
          return {
            output: [{ type: "text" as const, text: `${described.code}: ${described.message}` }],
            isError: true as const,
          };
        }
      },
    });

    const readFileTool = defineTool({
      name: "read_file",
      description: `Read a text file from the repository (${REPO_DIR}). Paths are relative to the repo, or absolute inside it.`,
      parameters: Type.Object({
        path: Type.String({ description: "Repo-relative path, e.g. src/index.ts." }),
      }),
      replay: "safe",
      execute: async (args) => {
        const resolved = resolveRepoPath(args.path);
        if (!resolved.ok) {
          return { output: [{ type: "text" as const, text: resolved.message }], isError: true as const };
        }
        try {
          // Symlink check in the container: read through the real path.
          const real = await this.exec(`realpath -- ${shellQuote(resolved.path)}`, { timeout: GIT_TIMEOUT });
          if (!real.success) {
            return { output: [{ type: "text" as const, text: `no such file: ${args.path}` }], isError: true as const };
          }
          const canonical = real.stdout.trim();
          if (canonical !== REPO_DIR && !canonical.startsWith(`${REPO_DIR}/`)) {
            return {
              output: [{ type: "text" as const, text: `path escapes the repository (${REPO_DIR})` }],
              isError: true as const,
            };
          }
          const result = await this.readFile(canonical);
          if (!result.success) {
            return {
              output: [{ type: "text" as const, text: `read failed (exit ${result.exitCode ?? "?"})` }],
              isError: true as const,
            };
          }
          return { output: [{ type: "text" as const, text: truncateText(result.content) }] };
        } catch (error) {
          const described = describeContainerError(error);
          return {
            output: [{ type: "text" as const, text: `${described.code}: ${described.message}` }],
            isError: true as const,
          };
        }
      },
    });

    const writeFileTool = defineTool({
      name: "write_file",
      description: `Write a text file in the repository (${REPO_DIR}; creates parent dirs). Paths are relative to the repo, or absolute inside it.`,
      parameters: Type.Object({
        path: Type.String({ description: "Repo-relative path." }),
        content: Type.String({ description: "Full file content." }),
      }),
      execute: async (args) => {
        const resolved = resolveRepoPath(args.path);
        if (!resolved.ok) {
          return { output: [{ type: "text" as const, text: resolved.message }], isError: true as const };
        }
        try {
          // Symlink check in the container: refuse to write through a
          // symlink, and resolve the parent before writing. (TOCTOU races
          // remain by construction — see the module note in paths.ts —
          // but the model already has unconstrained exec; this guards
          // accidents, not a hostile model.)
          const leaf = resolved.path.slice(resolved.path.lastIndexOf("/") + 1);
          const parent = resolved.path.slice(0, resolved.path.lastIndexOf("/")) || "/";
          const prepared = await this.exec(
            `mkdir -p -- ${shellQuote(parent)} && realpath -- ${shellQuote(parent)}`,
            { timeout: GIT_TIMEOUT }
          );
          if (!prepared.success) {
            return {
              output: [{ type: "text" as const, text: `could not prepare the parent dir: ${args.path}` }],
              isError: true as const,
            };
          }
          const realParent = prepared.stdout.trim();
          if (realParent !== REPO_DIR && !realParent.startsWith(`${REPO_DIR}/`)) {
            return {
              output: [{ type: "text" as const, text: `path escapes the repository (${REPO_DIR})` }],
              isError: true as const,
            };
          }
          const link = await this.exec(`test -L -- ${shellQuote(resolved.path)}`, { timeout: GIT_TIMEOUT });
          if (link.exitCode === 0) {
            return {
              output: [{ type: "text" as const, text: `refusing to write through a symlink: ${args.path}` }],
              isError: true as const,
            };
          }
          if (link.exitCode !== 1) {
            return {
              output: [
                { type: "text" as const, text: `symlink check failed for ${args.path}: ${truncateText(link.stderr || link.stdout)}` },
              ],
              isError: true as const,
            };
          }
          const result = await this.writeFile(`${realParent}/${leaf}`, args.content);
          if (!result.success) {
            return {
              output: [{ type: "text" as const, text: `write failed for ${args.path}` }],
              isError: true as const,
            };
          }
          return { output: [{ type: "text" as const, text: `wrote ${args.path}` }] };
        } catch (error) {
          const described = describeContainerError(error);
          return {
            output: [{ type: "text" as const, text: `${described.code}: ${described.message}` }],
            isError: true as const,
          };
        }
      },
    });

    const registry = createRegistry();
    registry.install(
      defineExtension({
        name: "agent-sandbox",
        tools: [execTool, readFileTool, writeFileTool],
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

    const storage = await openDurableObjectSqliteStorage(this.#ctx.storage);
    const harness = await Harness.open(
      storage,
      {
        models,
        registry,
        onWake: (wake) => {
          // Minimal arming: harnessWake chains itself while work is active
          // and the submit paths arm the first row, so onWake only covers
          // the two cases nobody else does — a sleep due while idle, and
          // recovery right after open (this.#harness is still unset then).
          // A failed schedule is retried at the next change or RPC.
          void (async () => {
            try {
              if (!wake.active && wake.at !== undefined) {
                await this.schedule(new Date(wake.at), "harnessWake");
              } else if (wake.active && this.#harness === undefined) {
                await this.schedule(0, "harnessWake");
              }
            } catch {
              // Retried at the next wake change or RPC.
            }
          })();
        },
      },
      BACKGROUND_CONTEXT
    );
    this.#harness = harness;
    harness.resume();
    if (harness.wake().active) {
      await this.schedule(0, "harnessWake");
    }
  }

  /**
   * Check the configured model without touching the conversation: faux is
   * always usable; otherwise the key must be set and the id must resolve.
   */
  #checkModel(ready: Ready):
    | { ok: true; selection: ModelSelection }
    | { ok: false; code: "model_not_configured" | "unknown_model"; message: string } {
    const selection = parseModelRef(this.#env.MODEL);
    if (selection.kind === "faux") {
      return { ok: true, selection };
    }
    if (nonEmpty(this.#env.OPENAI_API_KEY) === undefined) {
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
   * Root conversation with the configured model. Faux answers are topped
   * up to a small bounded pool (each model call consumes one): no
   * accumulation across submits, no starvation inside tool loops.
   */
  async #resolveConversation(
    ready: Ready
  ): Promise<
    | { ok: true; root: Conversation }
    | { ok: false; code: "model_not_configured" | "unknown_model"; message: string }
  > {
    const checked = this.#checkModel(ready);
    if (!checked.ok) {
      return checked;
    }
    const root = await ready.harness.root(BACKGROUND_CONTEXT);
    if (checked.selection.kind === "faux") {
      const modelId = ready.faux.getModel().id;
      await this.#ensureModel(root, { provider: "faux", modelId });
      this.#topUpFaux(ready.faux);
      return { ok: true, root };
    }
    await this.#ensureModel(root, { provider: OPENAI_PROVIDER, modelId: checked.selection.modelId });
    return { ok: true, root };
  }

  #topUpFaux(faux: FauxProviderHandle): void {
    while (faux.getPendingResponseCount() < 4) {
      faux.appendResponses([(context) => {
        const task = extractLastUserText(context.messages) ?? "(no task text)";
        return fauxAssistantMessage(`[faux test mode] No model call was made. The task was: ${task}`);
      }]);
    }
  }

  async #ensureModel(
    root: Conversation,
    ref: { provider: string; modelId: string }
  ): Promise<void> {
    const agent = await root.agent(BACKGROUND_CONTEXT);
    if (agent.model?.provider !== ref.provider || agent.model?.modelId !== ref.modelId) {
      await root.configure({ model: ref }, BACKGROUND_CONTEXT);
    }
  }

  async #renderTail(
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
      entries: ordered.map((entry) => ({ id: entry.id, ...(entry.model === undefined ? {} : { model: entry.model }) })),
      text: truncateText(renderMessages(messages), TRANSCRIPT_CAP),
    };
  }
}
