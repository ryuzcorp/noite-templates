import { DurableObject } from "cloudflare:workers";
import { defineDurableObject } from "void/durable";

import type { Env } from "../src/env";

/**
 * The per-sandbox container, driven directly through `ctx.container` — no
 * `void/sandbox`, no `@cloudflare/sandbox`. One named sandbox is one object
 * of this class (same name as the `Agent` object that drives it); the class
 * is declared in the deployed config's `containers[]` (see `void.config.ts`),
 * which is what gives it a `ctx.container` handle.
 *
 * Why direct: celld 0.6.3 cannot pass RPC stubs or streams across isolate
 * boundaries yet, and Void's sandbox client returns both (exec processes as
 * stubs, stdout/stderr as streams created in the sandbox object's isolate).
 * Every method here therefore consumes container output inside this isolate
 * and returns only structured-clonable plain data (strings, numbers, plain
 * objects, ArrayBuffers) — never stubs, functions, or streams. `fetch` is
 * the one exception, and it is fine: `stub.fetch()` answers with a
 * `Response` through the platform, not through RPC serialization.
 *
 * When celld supports cross-isolate RPC stubs/streams, this class goes away
 * in favor of Void Sandboxes (`void/sandbox` + `getSandbox`); the agent
 * object keeps its shape and only its sandbox client changes.
 */

export interface ContainerExecOptions {
  /** Working directory for the command. */
  cwd?: string;
  /** Bytes fed to the process on stdin (e.g. file content for `cat >`). */
  stdinText?: string;
  /** Kill the process past this deadline. Default EXEC_DEFAULT_TIMEOUT_MS. */
  timeoutMs?: number;
}

export interface ContainerExecResult {
  stdout: ArrayBuffer;
  stderr: ArrayBuffer;
  exitCode: number;
}

/** Default deadline for one exec (the longest tool timeout the agent uses). */
const EXEC_DEFAULT_TIMEOUT_MS = 300_000;
/**
 * How long an exec retries while the container is still materializing after
 * `start()` (celld 0.6.3 answers those early execs with 404 no such
 * container). Bounded: past this the error propagates.
 */
const START_GRACE_MS = 90_000;
const START_RETRY_STEP_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Only this failure retries during the start grace window. */
function isNoSuchContainer(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such container/i.test(message);
}

function stdinStream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

export class AgentContainer extends DurableObject<Env> {
  #container(): Container {
    const container = this.ctx.container;
    if (container === undefined) {
      throw new Error(
        "this Durable Object class has no container: the deployed containers[] entry must name this class"
      );
    }
    return container;
  }

  /**
   * Start the container when it is not running. Cloning needs egress, hence
   * `enableInternet` (fenced off the node, other nodes, and private ranges
   * by the platform). The idle window stays at the platform default
   * (10 minutes). A concurrent starter wins the race; "already running" is
   * success.
   */
  async #ensureStarted(): Promise<void> {
    const container = this.#container();
    if (container.running) {
      return;
    }
    try {
      container.start({ enableInternet: true });
    } catch (error) {
      if (!container.running) {
        throw error;
      }
    }
  }

  /**
   * Run a command to completion and return its output. Retries only the
   * no-such-container race (bounded by START_GRACE_MS); kills the process
   * past `timeoutMs`. Nothing secret is ever passed in `env` (callers pass
   * none at all).
   */
  async exec(argv: string[], options: ContainerExecOptions = {}): Promise<ContainerExecResult> {
    if (argv.length === 0) {
      throw new Error("exec() requires a non-empty command array");
    }
    const container = this.#container();
    await this.#ensureStarted();
    const timeoutMs = options.timeoutMs ?? EXEC_DEFAULT_TIMEOUT_MS;
    const started = Date.now();
    for (;;) {
      let proc: ExecProcess;
      try {
        proc = await container.exec(argv, {
          ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
          ...(options.stdinText === undefined ? {} : { stdin: stdinStream(options.stdinText) }),
        });
      } catch (error) {
        if (isNoSuchContainer(error) && Date.now() - started < START_GRACE_MS) {
          await this.#ensureStarted();
          await sleep(START_RETRY_STEP_MS);
          continue;
        }
        throw error;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const output = await Promise.race([
          proc.output(),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              try {
                proc.kill();
              } catch {
                // Best-effort: the rejection below carries the failure.
              }
              reject(new Error(`exec timed out after ${timeoutMs} ms: ${argv[0]}`));
            }, timeoutMs);
          }),
        ]);
        return { stdout: output.stdout, stderr: output.stderr, exitCode: output.exitCode };
      } finally {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      }
    }
  }

  /**
   * Start a long-lived process without waiting for it (the container-mode
   * agent server). Outputs are ignored so an unread pipe can never stall
   * it. Same start-race retry as `exec`.
   */
  async execDetached(argv: string[]): Promise<{ started: boolean }> {
    if (argv.length === 0) {
      throw new Error("execDetached() requires a non-empty command array");
    }
    const container = this.#container();
    await this.#ensureStarted();
    const started = Date.now();
    for (;;) {
      try {
        await container.exec(argv, { stdout: "ignore", stderr: "ignore" });
        return { started: true };
      } catch (error) {
        if (isNoSuchContainer(error) && Date.now() - started < START_GRACE_MS) {
          await this.#ensureStarted();
          await sleep(START_RETRY_STEP_MS);
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Proxy HTTP to a container port: the first path segment names the port
   * (`/<port>/health?x=1`), the rest crosses into the container unchanged.
   * Reached via `stub.fetch()` from the agent object, which answers with a
   * `Response` — the one container path that needs no plain-data wrapper.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/(\d+)(\/.*)?$/.exec(url.pathname);
    const port = match?.[1] === undefined ? NaN : Number(match[1]);
    if (!Number.isInteger(port) || port <= 0 || port >= 65536) {
      return Response.json({ error: "first path segment must be the container port" }, { status: 400 });
    }
    await this.#ensureStarted();
    const target = new Request(`http://127.0.0.1:${port}${match?.[2] ?? "/"}${url.search}`, request);
    return this.#container().getTcpPort(port).fetch(target);
  }
}

export const Container = defineDurableObject({
  class: AgentContainer,
});

export default Container;
