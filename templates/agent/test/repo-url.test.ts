import { describe, expect, test } from "bun:test";

import { classifyRef, parseRepoHosts, validateRepositoryUrl, validRef } from "../src/repo-url";

describe("parseRepoHosts", () => {
  test("defaults to github.com", () => {
    expect(parseRepoHosts(undefined)).toEqual(["github.com"]);
    expect(parseRepoHosts("")).toEqual(["github.com"]);
    expect(parseRepoHosts("  , ")).toEqual(["github.com"]);
  });

  test("splits, trims, and lowercases", () => {
    expect(parseRepoHosts("GitHub.com, gitlab.example.com ,,")).toEqual([
      "github.com",
      "gitlab.example.com",
    ]);
  });
});

describe("validateRepositoryUrl", () => {
  const hosts = ["github.com"];

  test("accepts a plain https repo URL and strips the fragment", () => {
    expect(validateRepositoryUrl("https://github.com/org/repo#readme", hosts)).toEqual({
      ok: true,
      normalized: "https://github.com/org/repo",
    });
  });

  test("rejects non-https, userinfo, ports, and bare hosts", () => {
    expect(validateRepositoryUrl("http://github.com/org/repo", hosts).ok).toBe(false);
    expect(validateRepositoryUrl("git@github.com:org/repo.git", hosts).ok).toBe(false);
    expect(validateRepositoryUrl("https://token@github.com/org/repo", hosts)).toEqual({
      ok: false,
      message: "repository url must not contain credentials",
    });
    expect(validateRepositoryUrl("https://user:pass@github.com/org/repo", hosts).ok).toBe(false);
    expect(validateRepositoryUrl("https://github.com:8443/org/repo", hosts)).toEqual({
      ok: false,
      message: "repository url must not contain an explicit port",
    });
    expect(validateRepositoryUrl("https://github.com", hosts).ok).toBe(false);
    expect(validateRepositoryUrl("not a url", hosts).ok).toBe(false);
  });

  test("rejects hosts outside the allowlist", () => {
    const result = validateRepositoryUrl("https://evil.example/org/repo", hosts);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("evil.example");
      expect(result.message).toContain("REPO_HOSTS");
    }
    expect(validateRepositoryUrl("https://github.com.evil.example/org/repo", hosts).ok).toBe(false);
    expect(validateRepositoryUrl("https://github.com/org/repo", ["GitHub.COM".toLowerCase()]).ok).toBe(
      true
    );
  });
});

describe("classifyRef", () => {
  test("a full SHA is explicit", () => {
    const sha = "a".repeat(40);
    expect(classifyRef(sha)).toEqual({ kind: "sha", sha });
    expect(classifyRef("ABCDEF1234".padEnd(40, "0"))).toMatchObject({ kind: "sha" });
  });

  test("branches and tags pass through", () => {
    expect(classifyRef("main")).toEqual({ kind: "branch", ref: "main" });
    expect(classifyRef("v1.2.3")).toEqual({ kind: "branch", ref: "v1.2.3" });
    expect(classifyRef("feature/x")).toEqual({ kind: "branch", ref: "feature/x" });
  });

  test("shell metacharacters are invalid", () => {
    for (const ref of ["main; rm -rf /", "$(evil)", "`evil`", "a b", "a|b", "a&b", "", "x".repeat(129)]) {
      expect(classifyRef(ref)).toEqual({ kind: "invalid" });
      expect(validRef(ref)).toBe(false);
    }
  });
});
