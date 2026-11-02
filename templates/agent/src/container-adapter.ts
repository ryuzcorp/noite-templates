/**
 * The worker/clone/server adapters over the container object
 * (`durable-objects/container.ts`). The client is injected (structurally
 * satisfied by the container-DO stub wrapper in the agent object) so tests
 * drive the adapter with fakes; this module never imports `void/*` and
 * loads under bun.
 *
 * File operations compose from exec: there is no file session in the
 * direct-container world, so `stat` is `test -e`, `readFile` is `cat`, and
 * `writeFile` is `cat` with the content on stdin (exact bytes, no shell
 * interpolation of the content itself). Missing paths throw a
 * `SandboxFileError` with code `ENOENT`, matching what the clone seam and
 * the tools already expect.
 */

import type { CloneSandbox } from "./clone-deps";
import { shellQuote } from "./paths";
import type { AgentServerSandbox } from "./server-client";
import type { WorkerToolsSandbox } from "./tools";

/** Minimal container surface the adapter needs. */
export interface ContainerClient {
  run(
    argv: string[],
    options?: { cwd?: string; timeoutMs?: number; stdinText?: string; startGraceMs?: number }
  ): Promise<{ stdout: ArrayBuffer; stderr: ArrayBuffer; exitCode: number }>;
  execDetached(argv: string[]): Promise<void>;
  fetch(port: number, request: Request): Promise<Response>;
}

/** A missing path (`ENOENT`) means "not there"; anything else propagates. */
function fileNotFound(path: string): Error {
  const error = new Error(`no such file: ${path}`);
  error.name = "SandboxFileError";
  Object.defineProperty(error, "code", { value: "ENOENT" });
  return error;
}

/**
 * Build the `WorkerToolsSandbox & CloneSandbox & AgentServerSandbox` the
 * tools, the clone seam, and the container-mode server client need, bound
 * to one container.
 */
export function createContainerAdapter(
  client: ContainerClient
): WorkerToolsSandbox & CloneSandbox & AgentServerSandbox {
  return {
    run: (argv, options) => client.run(argv, options),
    exec: async (argv) => {
      await client.execDetached(argv);
      return {};
    },
    fetch: (port, request) => client.fetch(port, request),
    files: {
      stat: async (path: string) => {
        const result = await client.run(["test", "-e", path]);
        if (result.exitCode !== 0) {
          throw fileNotFound(path);
        }
        return {};
      },
      readFile: async (path: string) => {
        const result = await client.run(["cat", path]);
        if (result.exitCode !== 0) {
          throw fileNotFound(path);
        }
        return new Response(result.stdout);
      },
      writeFile: async (path: string, content: string) => {
        const result = await client.run(["sh", "-c", `cat > ${shellQuote(path)}`], {
          stdinText: content,
        });
        if (result.exitCode !== 0) {
          const detail = new TextDecoder().decode(result.stderr) || new TextDecoder().decode(result.stdout);
          throw new Error(`could not write ${path}: ${detail.trim() || `exit ${result.exitCode}`}`);
        }
      },
    },
  };
}
