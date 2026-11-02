import { describe, expect, test } from "bun:test";

import { REPO_DIR } from "../src/paths";
import {
  ensureCheckout,
  performClone,
  type CloneCheckoutOptions,
  type CloneDeps,
  type CloneExecResult,
  type RepositoryRecord,
  type RepoStore,
} from "../src/repo-clone";

const URL = "https://github.com/org/repo";
const SHA = "0123456789abcdef0123456789abcdef01234567";

function ok(stdout = ""): CloneExecResult {
  return { success: true, stdout, stderr: "" };
}

function failed(stderr = "boom"): CloneExecResult {
  return { success: false, stdout: "", stderr };
}

/** Scripted container surface: exec answers come from a matcher queue. */
class FakeDeps implements CloneDeps {
  commands: string[] = [];
  gitDirExists = true;
  originUrl: string = URL;
  checkouts: Array<{ url: string; options: CloneCheckoutOptions }> = [];
  checkoutResult: { success: boolean; exitCode?: number | null } = { success: true };
  headCommit = "newhead";
  execOverrides: Array<{ match: (command: string) => boolean; result: CloneExecResult | Error }> = [];

  async exec(command: string): Promise<CloneExecResult> {
    this.commands.push(command);
    for (const override of this.execOverrides) {
      if (override.match(command)) {
        if (override.result instanceof Error) {
          throw override.result;
        }
        return override.result;
      }
    }
    if (command === "git config --get remote.origin.url") {
      return ok(`${this.originUrl}\n`);
    }
    if (command === "git rev-parse HEAD") {
      return ok(`${this.headCommit}\n`);
    }
    if (command.startsWith("git fetch ") || command.startsWith("git checkout")) {
      return ok("");
    }
    if (command.startsWith("rm -rf ")) {
      return ok("");
    }
    if (command.endsWith(" rev-parse HEAD")) {
      return ok(`${this.headCommit}\n`);
    }
    throw new Error(`unexpected command: ${command}`);
  }

  async exists(path: string): Promise<{ exists: boolean }> {
    expect(path).toBe(`${REPO_DIR}/.git`);
    return { exists: this.gitDirExists };
  }

  async checkout(
    url: string,
    options: CloneCheckoutOptions
  ): Promise<{ success: boolean; exitCode?: number | null }> {
    this.checkouts.push({ url, options });
    return this.checkoutResult;
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

describe("performClone refresh", () => {
  test("no ref fetches HEAD and detaches at the fetched commit", async () => {
    const deps = new FakeDeps();
    const outcome = await performClone(deps, URL);
    expect(outcome).toEqual({ commit: "newhead" });
    expect(deps.checkouts).toEqual([]);
    expect(deps.commands).toContain("git fetch --depth 1 origin HEAD");
    expect(deps.commands).toContain("git checkout --detach FETCH_HEAD");
  });

  test("branch refresh resets the branch to the fetched commit", async () => {
    const deps = new FakeDeps();
    const outcome = await performClone(deps, URL, "dev");
    expect(outcome).toEqual({ commit: "newhead" });
    expect(deps.checkouts).toEqual([]);
    expect(deps.commands).toContain("git fetch --depth 1 origin dev");
    // Plain `git checkout dev` would be a stale no-op (or fail on a
    // single-branch clone that never saw dev); -B moves the branch.
    expect(deps.commands).toContain("git checkout -B dev FETCH_HEAD");
  });

  test("sha refs fetch and detach at the sha", async () => {
    const deps = new FakeDeps();
    const outcome = await performClone(deps, URL, SHA);
    expect(outcome).toEqual({ commit: "newhead" });
    expect(deps.commands).toContain(`git fetch --depth 1 origin ${SHA}`);
    expect(deps.commands).toContain(`git checkout --detach ${SHA}`);
  });

  test("a fresh clone skips the refresh and records the new head", async () => {
    const deps = new FakeDeps();
    deps.gitDirExists = false;
    const outcome = await performClone(deps, URL, "main");
    expect(outcome).toEqual({ commit: "newhead" });
    expect(deps.checkouts).toHaveLength(1);
    expect(deps.checkouts[0]?.url).toBe(URL);
    expect(deps.checkouts[0]?.options).toMatchObject({ targetDir: REPO_DIR, depth: 1, branch: "main" });
    expect(deps.commands.some((command) => command.startsWith("git fetch "))).toBe(false);
  });

  test("a checkout whose origin moved is wiped and re-cloned", async () => {
    const deps = new FakeDeps();
    deps.originUrl = "https://github.com/org/other";
    const outcome = await performClone(deps, URL, "main");
    expect(outcome).toEqual({ commit: "newhead" });
    expect(deps.commands.some((command) => command.startsWith("rm -rf "))).toBe(true);
    expect(deps.checkouts).toHaveLength(1);
  });
});

describe("ensureCheckout", () => {
  test("a healthy checkout costs one probe and no writes", async () => {
    const store = new FakeStore({ url: URL, ref: "main", commit: "old", status: "ready" });
    const deps = new FakeDeps();
    const outcome = await ensureCheckout(store, deps, undefined);
    expect(outcome).toEqual({ ok: true, restored: false });
    expect(deps.commands).toEqual([`git -C '${REPO_DIR}' rev-parse HEAD`]);
    expect(deps.checkouts).toEqual([]);
    expect(store.saves).toEqual([]);
  });

  test("a missing checkout is re-cloned at the recorded ref", async () => {
    const store = new FakeStore({ url: URL, ref: "main", commit: "old", status: "ready" });
    const deps = new FakeDeps();
    deps.gitDirExists = false;
    deps.execOverrides.push({ match: (command) => command.startsWith("git -C "), result: failed("not a git repository") });
    const outcome = await ensureCheckout(store, deps, undefined);
    expect(outcome).toEqual({ ok: true, restored: true });
    expect(deps.checkouts).toHaveLength(1);
    expect(deps.checkouts[0]?.options).toMatchObject({ branch: "main" });
    expect(store.saves.map((saved) => saved.status)).toEqual(["cloning", "ready"]);
    expect(store.record).toMatchObject({ url: URL, ref: "main", commit: "newhead", status: "ready" });
  });

  test("a ref-less record restores at the recorded commit without pinning ref", async () => {
    const store = new FakeStore({ url: URL, commit: SHA, status: "ready" });
    const deps = new FakeDeps();
    deps.gitDirExists = false;
    deps.headCommit = SHA;
    deps.execOverrides.push({ match: (command) => command.startsWith("git -C "), result: failed("not a git repository") });
    const outcome = await ensureCheckout(store, deps, undefined);
    expect(outcome).toEqual({ ok: true, restored: true });
    expect(deps.checkouts).toHaveLength(1);
    expect(deps.checkouts[0]?.options.branch).toBeUndefined();
    expect(deps.commands).toContain(`git fetch --depth 1 origin ${SHA}`);
    // The record still tracks (no ref): a future refresh follows HEAD
    // instead of staying pinned to this SHA.
    expect(store.record).toEqual({ url: URL, commit: SHA, status: "ready" });
  });

  test("nothing recorded, or a non-ready record, is a no-op", async () => {
    for (const record of [null, { url: URL, status: "failed" as const, error: "x" }]) {
      const store = new FakeStore(record);
      const deps = new FakeDeps();
      expect(await ensureCheckout(store, deps, undefined)).toEqual({ ok: true, restored: false });
      expect(deps.commands).toEqual([]);
      expect(store.saves).toEqual([]);
    }
  });

  test("a url that left the allowlist fails without cloning", async () => {
    const store = new FakeStore({ url: "https://evil.example/org/repo", status: "ready" });
    const deps = new FakeDeps();
    deps.execOverrides.push({ match: (command) => command.startsWith("git -C "), result: failed("not a git repository") });
    const outcome = await ensureCheckout(store, deps, "github.com");
    expect(outcome.ok).toBe(false);
    expect(deps.checkouts).toEqual([]);
    expect(store.record?.status).toBe("failed");
  });

  test("a probe transport failure leaves the record untouched", async () => {
    const record: RepositoryRecord = { url: URL, ref: "main", commit: "old", status: "ready" };
    const store = new FakeStore(record);
    const deps = new FakeDeps();
    const transport = new Error("container down");
    (transport as { code?: string }).code = "CONTAINER_UNAVAILABLE";
    deps.execOverrides.push({ match: (command) => command.startsWith("git -C "), result: transport });
    const outcome = await ensureCheckout(store, deps, undefined);
    expect(outcome).toEqual({ ok: false, message: "container_unavailable: container down" });
    expect(store.record).toBe(record);
    expect(store.saves).toEqual([]);
    expect(deps.checkouts).toEqual([]);
  });
});
