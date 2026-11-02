import { describe, expect, test } from "bun:test";

import { createCloneDeps, type CloneSandbox } from "../src/clone-deps";
import { REPO_DIR } from "../src/paths";

function buf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

interface RunCall {
  argv: string[];
  options?: { cwd?: string; timeoutMs?: number };
}

class FakeSandbox implements CloneSandbox {
  runs: RunCall[] = [];
  runImpl: (argv: string[], options?: RunCall["options"]) => Promise<{
    stdout: ArrayBuffer;
    stderr: ArrayBuffer;
    exitCode: number;
  }> = async () => ({ stdout: buf(""), stderr: buf(""), exitCode: 0 });
  statImpl: (path: string) => Promise<unknown> = async () => ({});
  statPaths: string[] = [];

  async run(
    argv: string[],
    options?: { cwd?: string; timeoutMs?: number }
  ): Promise<{ stdout: ArrayBuffer; stderr: ArrayBuffer; exitCode: number }> {
    this.runs.push({ argv, options });
    return this.runImpl(argv, options);
  }

  files = {
    stat: async (path: string): Promise<unknown> => {
      this.statPaths.push(path);
      return this.statImpl(path);
    },
  };
}

function fileError(code: string): Error {
  const error = new Error(code);
  error.name = "SandboxFileError";
  Object.defineProperty(error, "code", { value: code });
  return error;
}

describe("createCloneDeps", () => {
  test("exec runs through sh -c with cwd, decoding output and mapping the exit code", async () => {
    const sandbox = new FakeSandbox();
    sandbox.runImpl = async () => ({ stdout: buf("out\n"), stderr: buf("err\n"), exitCode: 0 });
    const deps = createCloneDeps(sandbox);
    const result = await deps.exec("git status --short", { cwd: REPO_DIR, timeout: 1000 });
    expect(result).toEqual({ success: true, stdout: "out\n", stderr: "err\n", exitCode: 0 });
    expect(sandbox.runs).toHaveLength(1);
    expect(sandbox.runs[0]?.argv).toEqual(["sh", "-c", "git status --short"]);
    expect(sandbox.runs[0]?.options?.cwd).toBe(REPO_DIR);
    expect(sandbox.runs[0]?.options?.timeoutMs).toBe(1000);
  });

  test("exec reports a non-zero exit as failure", async () => {
    const sandbox = new FakeSandbox();
    sandbox.runImpl = async () => ({ stdout: buf(""), stderr: buf("nope"), exitCode: 128 });
    const deps = createCloneDeps(sandbox);
    const result = await deps.exec("git fetch origin main", { cwd: REPO_DIR, timeout: 1000 });
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(128);
    expect(result.stderr).toBe("nope");
  });

  test("exists stats the path; ENOENT means missing, other errors propagate", async () => {
    const sandbox = new FakeSandbox();
    const deps = createCloneDeps(sandbox);
    expect(await deps.exists(`${REPO_DIR}/.git`)).toEqual({ exists: true });
    expect(sandbox.statPaths).toEqual([`${REPO_DIR}/.git`]);

    sandbox.statImpl = async () => {
      throw fileError("ENOENT");
    };
    expect(await deps.exists(`${REPO_DIR}/.git`)).toEqual({ exists: false });

    const transport = new Error("container down");
    sandbox.statImpl = async () => {
      throw transport;
    };
    expect(deps.exists(`${REPO_DIR}/.git`)).rejects.toBe(transport);
  });

  test("checkout clones by argv (branch only for branches), with the clone timeout", async () => {
    const sandbox = new FakeSandbox();
    sandbox.runImpl = async () => ({ stdout: buf(""), stderr: buf(""), exitCode: 0 });
    const deps = createCloneDeps(sandbox);
    const result = await deps.checkout("https://github.com/org/repo", {
      targetDir: REPO_DIR,
      depth: 1,
      cloneTimeoutMs: 120_000,
      branch: "main",
    });
    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(sandbox.runs[0]?.argv).toEqual([
      "git",
      "clone",
      "--depth",
      "1",
      "--branch",
      "main",
      "https://github.com/org/repo",
      REPO_DIR,
    ]);
    expect(sandbox.runs[0]?.options?.timeoutMs).toBe(120_000);

    await deps.checkout("https://github.com/org/repo", {
      targetDir: REPO_DIR,
      depth: 1,
      cloneTimeoutMs: 120_000,
    });
    expect(sandbox.runs[1]?.argv).toEqual([
      "git",
      "clone",
      "--depth",
      "1",
      "https://github.com/org/repo",
      REPO_DIR,
    ]);
  });

  test("checkout reports a failed clone", async () => {
    const sandbox = new FakeSandbox();
    sandbox.runImpl = async () => ({ stdout: buf(""), stderr: buf("auth"), exitCode: 128 });
    const deps = createCloneDeps(sandbox);
    const result = await deps.checkout("https://github.com/org/repo", {
      targetDir: REPO_DIR,
      depth: 1,
      cloneTimeoutMs: 1000,
    });
    expect(result).toEqual({ success: false, exitCode: 128 });
  });
});
