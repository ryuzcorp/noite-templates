import { Sandbox } from "@cloudflare/sandbox";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  Type,
  createModels,
  fauxAssistantMessage,
  type AuthContext,
  type Message,
  type MutableModels,
} from "@earendil-works/pi-ai";
import { cloudflareAIGatewayProvider } from "@earendil-works/pi-ai/providers/cloudflare-ai-gateway";
import {
  fauxProvider,
  type FauxProviderHandle,
} from "@earendil-works/pi-ai/providers/faux";
import {
  Harness,
  createRegistry,
  defineExtension,
  defineTool,
  section,
  type Conversation,
  type EntryId,
} from "@earendil-works/pi-durable";
import { openDurableObjectSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/cloudflare";

import type { Env } from "./env";
import { parseModelRef } from "./model";
import { extractLastUserText, renderMessages, truncateText } from "./transcript";

/**
 * Pi Durable harness in a Worker Durable Object. One named sandbox is one
 * object: its conversation transcript lives in the object's SQLite storage,
 * and the pi tools run against the Sandbox container this same object
 * supervises (extends Sandbox, so exec/readFile/writeFile/gitCheckout are
 * inherited). Model calls stay in the Worker; the container is the tool
 * backend only and never sees credentials.
 */

const REPO_KEY = "agent:repo";
const REPO_DIR = "/workspace/repo";
const TRANSCRIPT_TAIL = 50;

export interface RepositoryState {
  url: string;
  ref?: string;
  commit?: string;
}

export type RepositoryResult =
  | { ok: true; commit?: string }
  | { ok: false; message: string };

export type TaskResult =
  | { ok: true; answer: string; transcript: string }
  | {
      ok: false;
      code: "model_not_configured" | "unknown_model" | "run_failed";
      message: string;
    };

export interface SandboxState {
  busy: boolean;
  model: string;
  repository: RepositoryState | null;
  transcript: string;
}

export type DiffResult =
  | { ok: true; commit?: string; status: string; diff: string }
  | { ok: false; code: "no_repository"; message: string };

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Ref allowlist: git branch/tag/sha characters only, so refs passed to git
 * through the shell cannot inject commands. Mirrors the Worker validation. */
function validRef(ref: string): boolean {
  return /^[A-Za-z0-9._/-]{1,128}$/.test(ref);
}

export class AgentSandbox extends Sandbox<Env> {
  readonly #ctx: DurableObjectState<{}>;
  readonly #env: Env;
  #harness: Harness | undefined = undefined;
  #models: MutableModels | undefined = undefined;
  #faux: FauxProviderHandle | undefined = undefined;
  readonly #ready: Promise<void>;
  #busy = false;

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    this.#ctx = ctx;
    this.#env = env;
    this.#ready = this.#init();
    // Mark handled: every public method awaits #ready and surfaces the error.
    this.#ready.catch(() => undefined);
  }

  override async alarm(): Promise<void> {
    await super.alarm();
    if (this.#harness === undefined) {
      return;
    }
    await this.#arm({ ...this.#harness.wake(), active: true });
    this.#harness.resume();
  }

  /** Clone (or refresh) the task repository into the container. */
  async ensureRepository(url: string, ref?: string): Promise<RepositoryResult> {
    await this.#ensureReady();
    if (!/^https:\/\/[^/]+\/.+$/.test(url)) {
      return { ok: false, message: "repository url must be an https:// URL" };
    }
    if (ref !== undefined && !validRef(ref)) {
      return { ok: false, message: "invalid ref" };
    }
    try {
      const marker = await this.exists(`${REPO_DIR}/.git`);
      if (!marker.exists) {
        const checkout = await this.gitCheckout(url, {
          targetDir: REPO_DIR,
          ...(ref === undefined ? {} : { branch: ref }),
          depth: 1,
        });
        if (!checkout.success) {
          return { ok: false, message: `clone failed (exit ${checkout.exitCode ?? "?"})` };
        }
      } else if (ref !== undefined) {
        const fetched = await this.exec(`git fetch --depth 1 origin ${ref}`, {
          cwd: REPO_DIR,
        });
        if (!fetched.success) {
          return { ok: false, message: truncateText(fetched.stderr || fetched.stdout) };
        }
        const checked = await this.exec(`git checkout ${ref}`, { cwd: REPO_DIR });
        if (!checked.success) {
          return { ok: false, message: truncateText(checked.stderr || checked.stdout) };
        }
      }
      const head = await this.exec("git rev-parse HEAD", { cwd: REPO_DIR });
      const commit = head.success ? head.stdout.trim() || undefined : undefined;
      const state: RepositoryState = { url, ...(ref === undefined ? {} : { ref }), ...(commit === undefined ? {} : { commit }) };
      await this.#ctx.storage.put(REPO_KEY, state);
      return { ok: true, ...(commit === undefined ? {} : { commit }) };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async submitTask(text: string): Promise<TaskResult> {
    await this.#ensureReady();
    const resolved = await this.#resolveConversation();
    if (!resolved.ok) {
      return { ok: false, code: resolved.code, message: resolved.message };
    }
    const root = resolved.root;
    this.#busy = true;
    try {
      const submission = await root.submit({ type: "input", content: text }, BACKGROUND_CONTEXT);
      const settled = await submission.wait(BACKGROUND_CONTEXT);
      if (settled.status !== "done") {
        return {
          ok: false,
          code: "run_failed",
          message: `run ended without an answer (${settled.status}: ${settled.reason})`,
        };
      }
      const transcript = await this.#renderTail(root, TRANSCRIPT_TAIL);
      const answerEntry = transcript.entries.find((entry) => entry.id === settled.answer);
      const answer =
        answerEntry !== undefined && answerEntry.model !== undefined
          ? renderMessages(answerEntry.model)
          : transcript.text;
      return { ok: true, answer, transcript: transcript.text };
    } catch (error) {
      return {
        ok: false,
        code: "run_failed",
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.#busy = false;
    }
  }

  /** Instance-local busy flag, repo pointer, and the transcript tail. */
  async getSandboxState(): Promise<SandboxState> {
    await this.#ensureReady();
    const repository = await this.#ctx.storage.get<RepositoryState>(REPO_KEY);
    const root = await this.#harnessRoot();
    const transcript = await this.#renderTail(root, TRANSCRIPT_TAIL);
    return {
      busy: this.#busy,
      model: this.#env.MODEL ?? "",
      repository: repository ?? null,
      transcript: transcript.text,
    };
  }

  /** git status + diff of the container checkout. No model calls. */
  async getDiff(): Promise<DiffResult> {
    await this.#ensureReady();
    const repository = await this.#ctx.storage.get<RepositoryState>(REPO_KEY);
    if (repository === null || repository === undefined) {
      return { ok: false, code: "no_repository", message: "no repository cloned yet" };
    }
    try {
      const status = await this.exec("git status --short && git diff --stat", { cwd: REPO_DIR });
      const diff = await this.exec("git diff", { cwd: REPO_DIR });
      if (!status.success || !diff.success) {
        return { ok: false, code: "no_repository", message: "not a git checkout" };
      }
      return {
        ok: true,
        ...(repository.commit === undefined ? {} : { commit: repository.commit }),
        status: truncateText(status.stdout),
        diff: truncateText(diff.stdout, 32_768),
      };
    } catch (error) {
      return { ok: false, code: "no_repository", message: error instanceof Error ? error.message : String(error) };
    }
  }

  async #init(): Promise<void> {
    // A recovery heartbeat before anything can throw: an object whose open
    // or recovery fails is started again.
    const fallback = Date.now() + 60_000;
    const current = await this.#ctx.storage.getAlarm();
    if (current === null || current > fallback) {
      await this.#ctx.storage.setAlarm(fallback);
    }
    const sandbox = this;

    const authContext: AuthContext = {
      env: async (name) => {
        // pi-ai's gateway auth reads CLOUDFLARE_* names; map them onto the
        // app env vars so the token stays in Worker env, never in code.
        if (name === "CLOUDFLARE_API_KEY") {
          return nonEmpty(sandbox.#env.AI_GATEWAY_TOKEN);
        }
        if (name === "CLOUDFLARE_ACCOUNT_ID") {
          return nonEmpty(sandbox.#env.AI_GATEWAY_ACCOUNT_ID);
        }
        if (name === "CLOUDFLARE_GATEWAY_ID") {
          return nonEmpty(sandbox.#env.AI_GATEWAY_ID);
        }
        return undefined;
      },
      fileExists: async () => false,
    };
    const models = createModels({ authContext });
    models.setProvider(cloudflareAIGatewayProvider());
    const faux = fauxProvider();
    models.setProvider(faux.provider);
    this.#models = models;
    this.#faux = faux;

    const execTool = defineTool({
      name: "exec",
      description: `Run a shell command in the sandbox container (cwd ${REPO_DIR}). Returns stdout, stderr, and the exit code.`,
      parameters: Type.Object({
        command: Type.String({ description: "Shell command to run." }),
        cwd: Type.Optional(Type.String({ description: "Working directory." })),
        timeoutMs: Type.Optional(Type.Number({ description: "Kill the command after this many ms." })),
      }),
      execute: async (args) => {
        try {
          const result = await sandbox.exec(args.command, {
            ...(args.cwd === undefined ? {} : { cwd: args.cwd }),
            ...(args.timeoutMs === undefined ? {} : { timeout: args.timeoutMs }),
          });
          const text = truncateText(
            `$ ${args.command}\nexit ${result.exitCode}\n${result.stdout}${result.stderr}`
          );
          return {
            output: [{ type: "text" as const, text }],
            ...(result.success ? {} : { isError: true as const }),
          };
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          return { output: [{ type: "text" as const, text }], isError: true as const };
        }
      },
    });

    const readFileTool = defineTool({
      name: "read_file",
      description: "Read a text file from the sandbox container.",
      parameters: Type.Object({
        path: Type.String({ description: "Absolute path, e.g. /workspace/repo/src/index.ts." }),
      }),
      replay: "safe",
      execute: async (args) => {
        try {
          const result = await sandbox.readFile(args.path);
          if (!result.success) {
            return {
              output: [{ type: "text" as const, text: `read failed (exit ${result.exitCode ?? "?"})` }],
              isError: true as const,
            };
          }
          return { output: [{ type: "text" as const, text: truncateText(result.content) }] };
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          return { output: [{ type: "text" as const, text }], isError: true as const };
        }
      },
    });

    const writeFileTool = defineTool({
      name: "write_file",
      description: "Write a text file in the sandbox container (creates parent dirs).",
      parameters: Type.Object({
        path: Type.String({ description: "Absolute path." }),
        content: Type.String({ description: "Full file content." }),
      }),
      execute: async (args) => {
        try {
          const result = await sandbox.writeFile(args.path, args.content);
          if (!result.success) {
            return {
              output: [{ type: "text" as const, text: `write failed for ${args.path}` }],
              isError: true as const,
            };
          }
          return { output: [{ type: "text" as const, text: `wrote ${args.path}` }] };
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          return { output: [{ type: "text" as const, text }], isError: true as const };
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
              `You are a coding agent working inside a sandbox container. The cloned repository (if any) is at ${REPO_DIR}; run commands with that cwd. ` +
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
          // A failed alarm write resets the object; it re-arms on next start.
          void this.#arm(wake).catch(() => undefined);
        },
      },
      BACKGROUND_CONTEXT
    );
    this.#harness = harness;
    // Armed before resume() runs anything, as for any call that can start work.
    await this.#arm({ ...harness.wake(), active: true });
    harness.resume();
  }

  async #ensureReady(): Promise<Harness> {
    await this.#ready;
    if (this.#harness === undefined || this.#models === undefined || this.#faux === undefined) {
      throw new Error("harness failed to open");
    }
    return this.#harness;
  }

  async #harnessRoot(): Promise<Conversation> {
    const harness = await this.#ensureReady();
    return harness.root(BACKGROUND_CONTEXT);
  }

  /**
   * Root conversation with the configured model, or the reason no model is
   * usable: gateway without a token, or an id outside the gateway catalog.
   * Faux mode always resolves (test-only scripted answers, real container).
   */
  async #resolveConversation(): Promise<
    | { ok: true; root: Conversation }
    | { ok: false; code: "model_not_configured" | "unknown_model"; message: string }
  > {
    const harness = await this.#ensureReady();
    const selection = parseModelRef(this.#env.MODEL);
    if (selection.kind === "faux") {
      const modelId = this.#faux?.getModel().id ?? "faux-1";
      const root = await harness.root(BACKGROUND_CONTEXT);
      await this.#ensureModel(root, { provider: "faux", modelId });
      this.#faux?.appendResponses([(context) => {
        const task = extractLastUserText(context.messages) ?? "(no task text)";
        return fauxAssistantMessage(
          `[faux test mode] No model call was made. The task was: ${task}`
        );
      }]);
      return { ok: true, root };
    }
    if (nonEmpty(this.#env.AI_GATEWAY_TOKEN) === undefined) {
      return {
        ok: false,
        code: "model_not_configured",
        message:
          "No model is configured. Set MODEL and AI_GATEWAY_TOKEN in the app environment (Noite Settings -> Environment); MODEL=faux runs a cred-less test loop.",
      };
    }
    const model = this.#models?.getModel(selection.provider, selection.modelId);
    if (model === undefined) {
      return {
        ok: false,
        code: "unknown_model",
        message: `Model "${selection.modelId}" is not in the ${selection.provider} catalog.`,
      };
    }
    const root = await harness.root(BACKGROUND_CONTEXT);
    await this.#ensureModel(root, { provider: selection.provider, modelId: selection.modelId });
    return { ok: true, root };
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
      text: renderMessages(messages),
    };
  }

  async #arm(wake: { active: boolean; at?: number | undefined }): Promise<void> {
    // A recovery heartbeat while work runs, never later than the earliest sleep.
    const heartbeat = wake.active ? Date.now() + 60_000 : undefined;
    const at =
      heartbeat === undefined || wake.at === undefined
        ? (heartbeat ?? wake.at)
        : Math.min(heartbeat, wake.at);
    if (at === undefined) {
      await this.#ctx.storage.deleteAlarm();
    } else {
      await this.#ctx.storage.setAlarm(at);
    }
  }
}

