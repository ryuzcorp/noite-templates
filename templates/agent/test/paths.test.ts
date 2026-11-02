import { describe, expect, test } from "bun:test";

import { REPO_DIR, resolveRepoPath, shellQuote } from "../src/paths";

describe("resolveRepoPath", () => {
  test("joins relative paths to the repo dir", () => {
    expect(resolveRepoPath("src/index.ts")).toEqual({ ok: true, path: `${REPO_DIR}/src/index.ts` });
    expect(resolveRepoPath("./src/../src/index.ts")).toEqual({
      ok: true,
      path: `${REPO_DIR}/src/index.ts`,
    });
  });

  test("accepts absolute paths inside the repo, including the dir itself", () => {
    expect(resolveRepoPath(REPO_DIR)).toEqual({ ok: true, path: REPO_DIR });
    expect(resolveRepoPath(`${REPO_DIR}/a/b`)).toEqual({ ok: true, path: `${REPO_DIR}/a/b` });
  });

  test("refuses escapes, siblings, and control characters", () => {
    expect(resolveRepoPath("..").ok).toBe(false);
    expect(resolveRepoPath("../etc/passwd").ok).toBe(false);
    expect(resolveRepoPath("src/../../..").ok).toBe(false);
    expect(resolveRepoPath("/etc/passwd").ok).toBe(false);
    expect(resolveRepoPath("/workspace").ok).toBe(false);
    expect(resolveRepoPath("/workspace/repo-evil/x").ok).toBe(false);
    expect(resolveRepoPath("").ok).toBe(false);
    expect(resolveRepoPath("a\0b").ok).toBe(false);
    expect(resolveRepoPath("a\nb").ok).toBe(false);
  });
});

describe("shellQuote", () => {
  test("single-quotes, escaping embedded quotes", () => {
    expect(shellQuote("/workspace/repo/a b")).toBe("'/workspace/repo/a b'");
    expect(shellQuote("/workspace/repo/a'b")).toBe("'/workspace/repo/a'\\''b'");
  });
});
