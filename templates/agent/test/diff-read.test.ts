import { describe, expect, test } from "bun:test";

import { RESTORING_MESSAGE, isNoSuchContainer, readDiff, type DiffReadDeps } from "../src/diff-read";
import { REPO_DIR } from "../src/paths";
import type {
  CloneCheckoutOptions,
  CloneDeps,
  CloneExecResult,
  RepositoryRecord,
  RepoStore,
} from "../src/repo-clone";

const URL = "https://github.com/org/repo";

function ok(stdout = ""): CloneExecResult {
  return { success: true, stdout, stderr: "" };
}

function failed(stderr = "boom"): CloneExecResult {
  return { success: false, stdout: "", stderr };
}

class FakeDeps implements CloneDeps {
  commands: Array<{ command: string; options?: { cwd?: string; timeout?: number; startGraceMs?: number } }> = [];
  probe: CloneExecResult | Error = ok("abc123\n");
  status: CloneExecResult | Error = ok(" M a.ts\n");
  stat: CloneExecResult | Error = ok(" a.ts | 1 +\n");
  diff: CloneExecResult | Error = ok("diff --git a/a.ts\n");
  checkouts = 0;

  async exec(
    command: string,
    options?: { cwd?: string; timeout?: number; startGraceMs?: number }
  ): Promise<CloneExecResult> {
    this.commands.push({ command, options });
    const result = command.startsWith("git -C ")
      ? this.probe
      : command === "git status --short"
        ? this.status
        : command === "git diff --stat"
          ? this.stat
          : command === "git diff"
            ? this.diff
            : new Error(`unexpected command: ${command}`);
    if (result instanceof Error) {
      throw result;
    }
    return result;
  }

  async exists(): Promise<{ exists: boolean }> {
    return { exists: true };
  }

  async checkout(): Promise<{ success: boolean; exitCode?: number | null }> {
    this.checkouts += 1;
    throw new Error("checkout must not run on the GET path");
  }
}

class FakeStore implements RepoStore {
  saves: RepositoryRecord[] = [];

  constructor(public record: RepositoryRecord | null = null) {}

  async loadRepo(): Promise<RepositoryRecord | null> {
    return this.record;
  }

  async saveRepo(record: RepositoryRecord): Promise<void> {
    this.record = record;
    this.saves.push(record);
  }
}

function makeDeps(record: RepositoryRecord | null): DiffReadDeps & {
  deps: FakeDeps;
  store: FakeStore;
  restores: number;
  running: boolean;
} {
  const harness = { deps: new FakeDeps(), store: new FakeStore(record), restores: 0, running: true };
  return {
    deps: harness.deps,
    store: harness.store,
    get restores() {
      return harness.restores;
    },
    get running() {
      return harness.running;
    },
    set running(value: boolean) {
      harness.running = value;
    },
    isRunning: async () => harness.running,
    scheduleRestore: async () => {
      harness.restores += 1;
    },
    repoHosts: undefined,
  };
}

describe("readDiff", () => {
  test("a healthy checkout reads from the container with a bounded, no-wait exec", async () => {
    const harness = makeDeps({ url: URL, ref: "main", commit: "abc123", status: "ready" });
    const result = await readDiff(harness);
    expect(result).toMatchObject({ ok: true, commit: "abc123" });
    if (result.ok) {
      expect(result.status).toContain("M a.ts");
    }
    expect(harness.restores).toBe(0);
    expect(harness.deps.checkouts).toBe(0);
    // Every git call is bounded and skips the start-grace retry loop.
    for (const call of harness.deps.commands) {
      expect(call.options?.startGraceMs).toBe(0);
      expect(call.options?.timeout).toBeLessThanOrEqual(10_000);
    }
  });

  test("a missing checkout schedules the restore and answers restoring without cloning", async () => {
    const harness = makeDeps({ url: URL, ref: "main", commit: "abc123", status: "ready" });
    harness.deps.probe = failed("not a git repository");
    const result = await readDiff(harness);
    expect(result).toEqual({ ok: false, code: "restoring", message: RESTORING_MESSAGE });
    expect(harness.restores).toBe(1);
    expect(harness.deps.checkouts).toBe(0);
    // No git status/diff attempted after the missing probe.
    expect(harness.deps.commands.map((call) => call.command)).toEqual([
      `git -C '${REPO_DIR}' rev-parse HEAD`,
    ]);
  });

  test("a cold container answers restoring without blocking on exec", async () => {
    const harness = makeDeps({ url: URL, ref: "main", commit: "abc123", status: "ready" });
    harness.running = false;
    const result = await readDiff(harness);
    expect(result).toEqual({ ok: false, code: "restoring", message: RESTORING_MESSAGE });
    expect(harness.restores).toBe(1);
    expect(harness.deps.commands).toEqual([]);
    expect(harness.deps.checkouts).toBe(0);
  });

  test("a recycle between the probe and the diff answers restoring", async () => {
    const harness = makeDeps({ url: URL, status: "ready" });
    harness.deps.status = new Error("no such container");
    expect(isNoSuchContainer(harness.deps.status)).toBe(true);
    const result = await readDiff(harness);
    expect(result).toEqual({ ok: false, code: "restoring", message: RESTORING_MESSAGE });
    expect(harness.restores).toBe(1);
  });

  test("clone-in-progress, failed, and missing repos keep their codes", async () => {
    const cloning = makeDeps({ url: URL, status: "cloning" });
    expect(await readDiff(cloning)).toMatchObject({ ok: false, code: "repo_busy" });
    expect(cloning.restores).toBe(0);

    const failedRecord = makeDeps({ url: URL, status: "failed", error: "clone failed" });
    expect(await readDiff(failedRecord)).toMatchObject({ ok: false, code: "git_failed" });

    const missing = makeDeps(null);
    expect(await readDiff(missing)).toMatchObject({ ok: false, code: "no_repository" });
  });

  test("a checkout that left the allowlist fails without scheduling", async () => {
    const harness = makeDeps({ url: "https://evil.example/org/repo", status: "ready" });
    harness.deps.probe = failed("not a git repository");
    harness.repoHosts = "github.com";
    const result = await readDiff(harness);
    expect(result.ok).toBe(false);
    expect(harness.restores).toBe(0);
    expect(harness.store.record?.status).toBe("failed");
  });

  test("git failures after a healthy probe stay git_failed", async () => {
    const harness = makeDeps({ url: URL, status: "ready" });
    harness.deps.diff = failed("corrupt");
    const result = await readDiff(harness);
    expect(result).toMatchObject({ ok: false, code: "git_failed" });
    expect(harness.restores).toBe(0);
  });
});
