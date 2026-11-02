import { describe, expect, test } from "bun:test";

import { createContainerAdapter, type ContainerClient } from "../src/container-adapter";
import { REPO_DIR } from "../src/paths";

function buf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

interface RunCall {
  argv: string[];
  options?: { cwd?: string; timeoutMs?: number; stdinText?: string };
}

class FakeContainer implements ContainerClient {
  runs: RunCall[] = [];
  runImpl: (argv: string[], options?: RunCall["options"]) => Promise<{
    stdout: ArrayBuffer;
    stderr: ArrayBuffer;
    exitCode: number;
  }> = async () => ({ stdout: buf(""), stderr: buf(""), exitCode: 0 });
  detached: string[][] = [];
  fetches: Array<{ port: number; request: Request }> = [];

  async run(
    argv: string[],
    options?: { cwd?: string; timeoutMs?: number; stdinText?: string }
  ): Promise<{ stdout: ArrayBuffer; stderr: ArrayBuffer; exitCode: number }> {
    this.runs.push({ argv, options });
    return this.runImpl(argv, options);
  }

  async execDetached(argv: string[]): Promise<void> {
    this.detached.push(argv);
  }

  async fetch(port: number, request: Request): Promise<Response> {
    this.fetches.push({ port, request });
    return new Response("ok");
  }
}

describe("createContainerAdapter", () => {
  test("run passes argv and options through", async () => {
    const container = new FakeContainer();
    container.runImpl = async () => ({ stdout: buf("out"), stderr: buf("err"), exitCode: 3 });
    const sandbox = createContainerAdapter(container);
    const result = await sandbox.run(["git", "status"], { cwd: REPO_DIR, timeoutMs: 1000 });
    expect(new TextDecoder().decode(result.stdout)).toBe("out");
    expect(new TextDecoder().decode(result.stderr)).toBe("err");
    expect(result.exitCode).toBe(3);
    expect(container.runs).toEqual([
      { argv: ["git", "status"], options: { cwd: REPO_DIR, timeoutMs: 1000 } },
    ]);
  });

  test("exec starts detached; fetch forwards port and request", async () => {
    const container = new FakeContainer();
    const sandbox = createContainerAdapter(container);
    await sandbox.exec(["node", "/opt/agent/server.mjs"], { stdout: "ignore", stderr: "ignore" });
    expect(container.detached).toEqual([["node", "/opt/agent/server.mjs"]]);

    const request = new Request("http://127.0.0.1:8787/health");
    const response = await sandbox.fetch(8787, request);
    expect(response.ok).toBe(true);
    expect(container.fetches).toHaveLength(1);
    expect(container.fetches[0]?.port).toBe(8787);
    expect(container.fetches[0]?.request).toBe(request);
  });

  test("stat is test -e; a missing path throws ENOENT, anything else propagates", async () => {
    const container = new FakeContainer();
    const sandbox = createContainerAdapter(container);
    await sandbox.files.stat(`${REPO_DIR}/.git`);
    expect(container.runs[0]?.argv).toEqual(["test", "-e", `${REPO_DIR}/.git`]);

    container.runImpl = async () => ({ stdout: buf(""), stderr: buf(""), exitCode: 1 });
    const missing = await sandbox.files.stat(`${REPO_DIR}/.git`).then(
      () => null,
      (failure: unknown) => failure as { name?: string; code?: string }
    );
    expect(missing?.name).toBe("SandboxFileError");
    expect(missing?.code).toBe("ENOENT");
  });

  test("readFile cats the path; a missing file throws ENOENT", async () => {
    const container = new FakeContainer();
    container.runImpl = async () => ({ stdout: buf("content\n"), stderr: buf(""), exitCode: 0 });
    const sandbox = createContainerAdapter(container);
    const response = await sandbox.files.readFile(`${REPO_DIR}/src/a.ts`);
    expect(await response.text()).toBe("content\n");
    expect(container.runs[0]?.argv).toEqual(["cat", `${REPO_DIR}/src/a.ts`]);

    container.runImpl = async () => ({ stdout: buf(""), stderr: buf("nope"), exitCode: 1 });
    const missing = await sandbox.files.readFile(`${REPO_DIR}/gone.ts`).then(
      () => null,
      (failure: unknown) => failure as { name?: string; code?: string }
    );
    expect(missing?.name).toBe("SandboxFileError");
    expect(missing?.code).toBe("ENOENT");
  });

  test("writeFile cats stdin into the quoted path; failures carry stderr", async () => {
    const container = new FakeContainer();
    const sandbox = createContainerAdapter(container);
    await sandbox.files.writeFile(`${REPO_DIR}/a'b.ts`, "x\ny");
    expect(container.runs[0]?.argv).toEqual(["sh", "-c", `cat > '${REPO_DIR}/a'\\''b.ts'`]);
    expect(container.runs[0]?.options).toEqual({ stdinText: "x\ny" });

    container.runImpl = async () => ({ stdout: buf(""), stderr: buf("read-only\n"), exitCode: 1 });
    const failed = await sandbox.files.writeFile(`${REPO_DIR}/b.ts`, "x").then(
      () => null,
      (failure: unknown) => failure as Error
    );
    expect(failed?.message).toContain("read-only");
  });
});
