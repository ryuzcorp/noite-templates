import { describe, expect, test } from "bun:test";

import { validateSandboxName } from "../src/sandbox-name";

describe("validateSandboxName", () => {
  test("accepts lowercase letters, digits, dashes (1-63 chars)", () => {
    expect(validateSandboxName("demo")).toEqual({ ok: true, name: "demo" });
    expect(validateSandboxName("a")).toEqual({ ok: true, name: "a" });
    expect(validateSandboxName("0-9-x")).toEqual({ ok: true, name: "0-9-x" });
    expect(validateSandboxName("a".repeat(63))).toMatchObject({ ok: true });
  });

  test("rejects anything else with the stable message", () => {
    const message = "invalid sandbox name (lowercase letters, digits, dashes)";
    for (const name of ["", "Demo", "demo_x", "demo/x", "demo x", "-demo", "a".repeat(64), "démo"]) {
      expect(validateSandboxName(name)).toEqual({ ok: false, message });
    }
  });
});
