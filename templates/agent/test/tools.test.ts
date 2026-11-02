import { describe, expect, test } from "bun:test";

import { REPO_DIR } from "../src/paths";
import {
  createWorkerTools,
  execToolResult,
  readFileToolResult,
  writeFileToolResult,
  type WorkerToolsSandbox,
} from "../src/tools";

function buf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

interface RunCall {
  argv: string[];
  options?: { cwd?: string; signal?: AbortSignal };
}

class FakeSandbox implements WorkerToolsSandbox {
  runs: RunCall[] = [];
  runImpl: (argv: string[], options?: RunCall["options"]) => Promise<{
    stdout: ArrayBuffer;
    stderr: ArrayBuffer;
    exitCode: number;
  }> = async () => ({ stdout: buf(""), stderr: buf(""), exitCode: 0 });
  reads: string[] = [];
  readImpl: (path: string) => Promise<Response> = async () => new Response("file text");
  writes: Array<{ path: string; content: string }> = [];

  async run(
    argv: string[],
    options?: { cwd?: string; signal?: AbortSignal }
  ): Promise<{ stdout: ArrayBuffer; stderr: ArrayBuffer; exitCode: number }> {
    this.runs.push({ argv, options });
    return this.runImpl(argv, options);
  }

  files = {
    readFile: async (path: string): Promise<Response> => {
      this.reads.push(path);
      return this.readImpl(path);
    },
    writeFile: async (path: string, content: string): Promise<void> => {
      this.writes.push({ path, content });
    },
  };
}

function outputText(result: { output?: unknown }): string {
  const output = result.output as Array<{ text?: string }> | undefined;
  return output?.map((block) => block.text ?? "").join("\n") ?? "";
}

describe("worker tools", () => {
  test("createWorkerTools exposes exec, read_file, write_file", () => {
    const tools = createWorkerTools(new FakeSandbox());
    expect(tools.map((tool) => tool.name)).toEqual(["exec", "read_file", "write_file"]);
  });

  test("exec runs in the repo dir and labels stdout/stderr", async () => {
    const sandbox = new FakeSandbox();
    sandbox.runImpl = async () => ({ stdout: buf("hi\n"), stderr: buf("warn\n"), exitCode: 0 });
    const result = await execToolResult(sandbox, "git log --oneline -1", undefined);
    expect(result.isError).toBeUndefined();
    expect(outputText(result)).toContain("$ git log --oneline -1");
    expect(outputText(result)).toContain("exit 0");
    expect(outputText(result)).toContain("hi");
    expect(outputText(result)).toContain("warn");
    expect(sandbox.runs[0]?.argv).toEqual(["sh", "-c", "git log --oneline -1"]);
    expect(sandbox.runs[0]?.options?.cwd).toBe(REPO_DIR);
  });

  test("exec marks a non-zero exit as an error", async () => {
    const sandbox = new FakeSandbox();
    sandbox.runImpl = async () => ({ stdout: buf(""), stderr: buf("boom"), exitCode: 1 });
    const result = await execToolResult(sandbox, "false", undefined);
    expect(result.isError).toBe(true);
    expect(outputText(result)).toContain("boom");
  });

  test("exec maps a container failure to a stable error", async () => {
    const sandbox = new FakeSandbox();
    const transport = new Error("container down");
    (transport as { code?: string }).code = "CONTAINER_UNAVAILABLE";
    sandbox.runImpl = async () => {
      throw transport;
    };
    const result = await execToolResult(sandbox, "ls", undefined);
    expect(result.isError).toBe(true);
    expect(outputText(result)).toContain("container_unavailable");
  });

  test("read_file resolves against the repo and reads through the real path", async () => {
    const sandbox = new FakeSandbox();
    sandbox.runImpl = async (argv) => {
      expect(argv[0]).toBe("realpath");
      return { stdout: buf(`${REPO_DIR}/src/a.ts\n`), stderr: buf(""), exitCode: 0 };
    };
    const result = await readFileToolResult(sandbox, "src/a.ts");
    expect(result.isError).toBeUndefined();
    expect(outputText(result)).toBe("file text");
    expect(sandbox.reads).toEqual([`${REPO_DIR}/src/a.ts`]);
  });

  test("read_file refuses lexical escapes and symlink escapes", async () => {
    const sandbox = new FakeSandbox();
    const lexical = await readFileToolResult(sandbox, "../etc/passwd");
    expect(lexical.isError).toBe(true);
    expect(outputText(lexical)).toContain("escapes the repository");
    expect(sandbox.runs).toEqual([]);

    sandbox.runImpl = async () => ({ stdout: buf("/etc/passwd\n"), stderr: buf(""), exitCode: 0 });
    const symlink = await readFileToolResult(sandbox, "link");
    expect(symlink.isError).toBe(true);
    expect(outputText(symlink)).toContain("escapes the repository");
    expect(sandbox.reads).toEqual([]);
  });

  test("read_file reports a missing file", async () => {
    const sandbox = new FakeSandbox();
    sandbox.runImpl = async () => ({ stdout: buf(""), stderr: buf("nope"), exitCode: 1 });
    const result = await readFileToolResult(sandbox, "missing.ts");
    expect(result.isError).toBe(true);
    expect(outputText(result)).toContain("no such file");
  });

  test("write_file prepares the parent, checks the symlink, and writes", async () => {
    const sandbox = new FakeSandbox();
    const seen: string[][] = [];
    sandbox.runImpl = async (argv) => {
      seen.push(argv);
      if (argv[0] === "mkdir") {
        return { stdout: buf(""), stderr: buf(""), exitCode: 0 };
      }
      if (argv[0] === "realpath") {
        return { stdout: buf(`${REPO_DIR}/src\n`), stderr: buf(""), exitCode: 0 };
      }
      return { stdout: buf(""), stderr: buf(""), exitCode: 1 };
    };
    const result = await writeFileToolResult(sandbox, "src/b.ts", "content");
    expect(result.isError).toBeUndefined();
    expect(seen[0]).toEqual(["mkdir", "-p", `${REPO_DIR}/src`]);
    expect(seen[1]).toEqual(["realpath", `${REPO_DIR}/src`]);
    expect(seen[2]).toEqual(["test", "-L", `${REPO_DIR}/src/b.ts`]);
    expect(sandbox.writes).toEqual([{ path: `${REPO_DIR}/src/b.ts`, content: "content" }]);
  });

  test("write_file refuses symlinks and escapes without writing", async () => {
    const sandbox = new FakeSandbox();
    sandbox.runImpl = async (argv) => {
      if (argv[0] === "test") {
        return { stdout: buf(""), stderr: buf(""), exitCode: 0 };
      }
      return { stdout: buf(`${REPO_DIR}\n`), stderr: buf(""), exitCode: 0 };
    };
    const symlink = await writeFileToolResult(sandbox, "link", "x");
    expect(symlink.isError).toBe(true);
    expect(outputText(symlink)).toContain("symlink");
    expect(sandbox.writes).toEqual([]);

    const escape = await writeFileToolResult(sandbox, "/etc/x", "x");
    expect(escape.isError).toBe(true);
    expect(sandbox.writes).toEqual([]);
  });
});
