/**
 * Worker-mode tools (`exec`, `read_file`, `write_file`) over the container
 * object (`durable-objects/container.ts`, via `src/container-adapter.ts`).
 * The client is injected (structurally satisfied by the container adapter)
 * so tests drive the tools with fakes; this module never imports `void/*`
 * and loads under bun.
 *
 * Timeouts cross to the container as milliseconds, not signals: an
 * `AbortSignal` cannot cross the DO↔DO call, so the container object kills
 * the process past the deadline itself.
 *
 * Confinement is defense-in-depth against accidents and indirect prompt
 * injection, not a sandbox boundary: the model already has unconstrained
 * `exec` by design — the container itself is the boundary.
 */

import { Type } from "@earendil-works/pi-ai";
import {
  defineTool,
  type ToolExecutionResult,
  type ToolRegistration,
} from "@earendil-works/pi-durable";

import { describeContainerError } from "./errors";
import { REPO_DIR, resolveRepoPath } from "./paths";
import { GIT_TIMEOUT } from "./repo-clone";
import { truncateText } from "./transcript";

/** Minimal sandbox surface the worker tools need. */
export interface WorkerToolsSandbox {
  run(
    argv: string[],
    options?: { cwd?: string; timeoutMs?: number }
  ): Promise<{ stdout: ArrayBuffer; stderr: ArrayBuffer; exitCode: number }>;
  files: {
    readFile(path: string): Promise<Response>;
    writeFile(path: string, content: string): Promise<void>;
  };
}

/** Model calls have no deadline of their own; tool execs do. */
const EXEC_TIMEOUT_DEFAULT = 60_000;
const EXEC_TIMEOUT_MAX = 300_000;
const EXEC_OUTPUT_CAP = 8000;

function decode(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer);
}

function textResult(text: string): ToolExecutionResult {
  return { output: [{ type: "text" as const, text }] };
}

function errorResult(text: string): ToolExecutionResult {
  return { output: [{ type: "text" as const, text }], isError: true as const };
}

/** Run a shell command with cwd `REPO_DIR` (server-side; no cwd parameter). */
export async function execToolResult(
  sandbox: WorkerToolsSandbox,
  command: string,
  timeoutMs: number | undefined
): Promise<ToolExecutionResult> {
  const timeout =
    timeoutMs === undefined || !Number.isFinite(timeoutMs)
      ? EXEC_TIMEOUT_DEFAULT
      : Math.max(1000, Math.min(EXEC_TIMEOUT_MAX, Math.floor(timeoutMs)));
  try {
    const result = await sandbox.run(["sh", "-c", command], {
      cwd: REPO_DIR,
      timeoutMs: timeout,
    });
    const text = truncateText(
      `$ ${command}\nexit ${result.exitCode}\n--- stdout ---\n${decode(result.stdout)}\n--- stderr ---\n${decode(result.stderr)}`,
      EXEC_OUTPUT_CAP
    );
    const base = textResult(text);
    return result.exitCode === 0 ? base : { ...base, isError: true as const };
  } catch (error) {
    const described = describeContainerError(error);
    return errorResult(`${described.code}: ${described.message}`);
  }
}

/** Read a text file from the repository, confined to `REPO_DIR`. */
export async function readFileToolResult(
  sandbox: WorkerToolsSandbox,
  inputPath: string
): Promise<ToolExecutionResult> {
  const resolved = resolveRepoPath(inputPath);
  if (!resolved.ok) {
    return errorResult(resolved.message);
  }
  try {
    // Symlink check in the container: read through the real path.
    const real = await sandbox.run(["realpath", resolved.path], {
      timeoutMs: GIT_TIMEOUT,
    });
    if (real.exitCode !== 0) {
      return errorResult(`no such file: ${inputPath}`);
    }
    const canonical = decode(real.stdout).trim();
    if (canonical !== REPO_DIR && !canonical.startsWith(`${REPO_DIR}/`)) {
      return errorResult(`path escapes the repository (${REPO_DIR})`);
    }
    const response = await sandbox.files.readFile(canonical);
    return textResult(truncateText(await response.text()));
  } catch (error) {
    const described = describeContainerError(error);
    return errorResult(`${described.code}: ${described.message}`);
  }
}

/** Write a text file in the repository, confined to `REPO_DIR`. */
export async function writeFileToolResult(
  sandbox: WorkerToolsSandbox,
  inputPath: string,
  content: string
): Promise<ToolExecutionResult> {
  const resolved = resolveRepoPath(inputPath);
  if (!resolved.ok) {
    return errorResult(resolved.message);
  }
  try {
    // Symlink check in the container: refuse to write through a symlink,
    // and resolve the parent before writing. (TOCTOU races remain by
    // construction — see the module note in paths.ts — but the model
    // already has unconstrained exec; this guards accidents, not a hostile
    // model.)
    const leaf = resolved.path.slice(resolved.path.lastIndexOf("/") + 1);
    const parent = resolved.path.slice(0, resolved.path.lastIndexOf("/")) || "/";
    const made = await sandbox.run(["mkdir", "-p", parent], {
      timeoutMs: GIT_TIMEOUT,
    });
    if (made.exitCode !== 0) {
      return errorResult(`could not prepare the parent dir: ${inputPath}`);
    }
    const real = await sandbox.run(["realpath", parent], {
      timeoutMs: GIT_TIMEOUT,
    });
    if (real.exitCode !== 0) {
      return errorResult(`could not prepare the parent dir: ${inputPath}`);
    }
    const realParent = decode(real.stdout).trim();
    if (realParent !== REPO_DIR && !realParent.startsWith(`${REPO_DIR}/`)) {
      return errorResult(`path escapes the repository (${REPO_DIR})`);
    }
    const link = await sandbox.run(["test", "-L", resolved.path], {
      timeoutMs: GIT_TIMEOUT,
    });
    if (link.exitCode === 0) {
      return errorResult(`refusing to write through a symlink: ${inputPath}`);
    }
    if (link.exitCode !== 1) {
      return errorResult(
        `symlink check failed for ${inputPath}: ${truncateText(decode(link.stderr) || decode(link.stdout))}`
      );
    }
    await sandbox.files.writeFile(`${realParent}/${leaf}`, content);
    return textResult(`wrote ${inputPath}`);
  } catch (error) {
    const described = describeContainerError(error);
    return errorResult(`${described.code}: ${described.message}`);
  }
}

/** The three worker-mode tools, bound to one sandbox. */
export function createWorkerTools(sandbox: WorkerToolsSandbox): ToolRegistration[] {
  const execTool = defineTool({
    name: "exec",
    description: `Run a shell command in the sandbox container in ${REPO_DIR}. Returns stdout, stderr, and the exit code.`,
    parameters: Type.Object({
      command: Type.String({ description: "Shell command to run." }),
      timeoutMs: Type.Optional(Type.Number({ description: "Kill the command after this many ms (default 60000, max 300000)." })),
    }),
    execute: async (args) => execToolResult(sandbox, args.command, args.timeoutMs),
  });

  const readFileTool = defineTool({
    name: "read_file",
    description: `Read a text file from the repository (${REPO_DIR}). Paths are relative to the repo, or absolute inside it.`,
    parameters: Type.Object({
      path: Type.String({ description: "Repo-relative path, e.g. src/index.ts." }),
    }),
    replay: "safe",
    execute: async (args) => readFileToolResult(sandbox, args.path),
  });

  const writeFileTool = defineTool({
    name: "write_file",
    description: `Write a text file in the repository (${REPO_DIR}; creates parent dirs). Paths are relative to the repo, or absolute inside it.`,
    parameters: Type.Object({
      path: Type.String({ description: "Repo-relative path." }),
      content: Type.String({ description: "Full file content." }),
    }),
    execute: async (args) => writeFileToolResult(sandbox, args.path, args.content),
  });

  return [execTool, readFileTool, writeFileTool];
}
