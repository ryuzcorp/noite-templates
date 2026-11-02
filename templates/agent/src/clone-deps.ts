/**
 * `CloneDeps` over a Void sandbox (`void/sandbox`). The client is injected
 * (structurally satisfied by the real sandbox client) so tests drive the
 * adapter with fakes; this module never imports `void/*` and loads under
 * bun. Commands run as argv (no shell quoting needed for the git commands
 * themselves); the legacy string-exec seam runs through `sh -c`.
 */

import {
  GIT_TIMEOUT,
  type CloneCheckoutOptions,
  type CloneDeps,
  type CloneExecResult,
} from "./repo-clone";

/** Minimal sandbox surface the clone adapter needs. */
export interface CloneSandbox {
  run(
    argv: string[],
    options?: { cwd?: string; signal?: AbortSignal }
  ): Promise<{ stdout: ArrayBuffer; stderr: ArrayBuffer; exitCode: number }>;
  files: {
    stat(path: string): Promise<unknown>;
  };
}

function decode(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer);
}

/** A missing path (`ENOENT`) means "not there"; anything else propagates. */
function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const record = error as Record<string, unknown>;
  return record["name"] === "SandboxFileError" && record["code"] === "ENOENT";
}

/** Build the `CloneDeps` the clone module needs, bound to one sandbox. */
export function createCloneDeps(sandbox: CloneSandbox): CloneDeps {
  return {
    exec: async (command: string, options?: { cwd?: string; timeout?: number }): Promise<CloneExecResult> => {
      const timeout = options?.timeout ?? GIT_TIMEOUT;
      const result = await sandbox.run(["sh", "-c", command], {
        ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
        signal: AbortSignal.timeout(timeout),
      });
      return {
        success: result.exitCode === 0,
        stdout: decode(result.stdout),
        stderr: decode(result.stderr),
        exitCode: result.exitCode,
      };
    },

    exists: async (path: string): Promise<{ exists: boolean }> => {
      try {
        await sandbox.files.stat(path);
        return { exists: true };
      } catch (error) {
        if (isNotFound(error)) {
          return { exists: false };
        }
        throw error;
      }
    },

    checkout: async (
      url: string,
      options: CloneCheckoutOptions
    ): Promise<{ success: boolean; exitCode?: number | null }> => {
      const argv = ["git", "clone", "--depth", String(options.depth)];
      // SHAs are fetched explicitly after the clone; only branches/tags go here.
      if (options.branch !== undefined) {
        argv.push("--branch", options.branch);
      }
      argv.push(url, options.targetDir);
      const result = await sandbox.run(argv, { signal: AbortSignal.timeout(options.cloneTimeoutMs) });
      return { success: result.exitCode === 0, exitCode: result.exitCode };
    },
  };
}
