import { describe, expect, test } from "bun:test";

import { TOKEN_SETUP_MESSAGE, checkAuth, configuredToken, constantTimeEqual } from "../src/auth";

describe("constantTimeEqual", () => {
  test("compares exactly, including unicode and length", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("abcd", "abc")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual("", "x")).toBe(false);
    expect(constantTimeEqual("tökén-ünïcode", "tökén-ünïcode")).toBe(true);
    expect(constantTimeEqual("tökén-ünïcode", "tökén-ünïcodf")).toBe(false);
  });
});

describe("configuredToken", () => {
  test("blank means unconfigured", () => {
    expect(configuredToken(undefined)).toBeUndefined();
    expect(configuredToken("")).toBeUndefined();
    expect(configuredToken("   ")).toBeUndefined();
    expect(configuredToken(" secret ")).toBe("secret");
  });
});

describe("checkAuth", () => {
  const request = (authorization: string | null): Request =>
    new Request("https://app.test/sandboxes/x", {
      headers: authorization === null ? {} : { authorization },
    });

  test("missing token config is a 503 with the setup message", () => {
    const verdict = checkAuth(request("Bearer wrong-token"), undefined);
    expect(verdict).toEqual({ ok: false, status: 503, error: TOKEN_SETUP_MESSAGE });
    expect(TOKEN_SETUP_MESSAGE).toContain("AGENT_TOKEN");
  });

  test("missing or wrong credentials are a 401 that reveals nothing", () => {
    for (const header of [null, "Basic abc", "Bearer wrong-token", "Bearer ", "bearer"]) {
      const verdict = checkAuth(request(header), "correct-token");
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) {
        expect(verdict.status).toBe(401);
        expect(verdict.error).not.toContain("correct-token");
      }
    }
  });

  test("the right bearer token passes, scheme case-insensitively", () => {
    expect(checkAuth(request("Bearer correct-token"), "correct-token")).toEqual({ ok: true });
    expect(checkAuth(request("bearer correct-token"), "correct-token")).toEqual({ ok: true });
  });
});
