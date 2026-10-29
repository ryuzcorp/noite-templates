import { describe, expect, test } from "bun:test";

import { deriveCelldConfig, stripJsonc } from "../scripts/build";

describe("stripJsonc", () => {
  test("removes line and block comments, keeps // inside strings", () => {
    const source = '{\n// a comment\n"url": "https://x/y", /* multi\nline */ "n": 1\n}';
    expect(JSON.parse(stripJsonc(source))).toEqual({ url: "https://x/y", n: 1 });
  });
});

describe("deriveCelldConfig", () => {
  test("keeps the allowlist, rewrites main, keeps vars, pins the image", () => {
    const config = deriveCelldConfig(
      {
        name: "noite-agent",
        main: "src/index.ts",
        vars: { MODEL: "x" },
        unknownKey: true,
        containers: [{ class_name: "AgentSandbox", image: "placeholder" }],
      },
      "ghcr.io/ryuzcorp/noite-templates-agent-sandbox:abc1234",
      undefined
    );
    expect(config["main"]).toBe("worker.js");
    expect(config["vars"]).toEqual({ MODEL: "x" });
    expect(config["unknownKey"]).toBeUndefined();
    expect(config["containers"]).toEqual([
      { class_name: "AgentSandbox", image: "ghcr.io/ryuzcorp/noite-templates-agent-sandbox:abc1234" },
    ]);
  });

  test("a build-time token overrides the committed placeholder", () => {
    const config = deriveCelldConfig(
      { vars: { MODEL: "x", AI_GATEWAY_TOKEN: "placeholder" } },
      undefined,
      "build-time-token"
    );
    expect(config["vars"]).toEqual({ MODEL: "x", AI_GATEWAY_TOKEN: "build-time-token" });
  });

  test("missing vars become an empty object, never dropped", () => {
    const config = deriveCelldConfig({}, undefined, undefined);
    expect(config["vars"]).toEqual({});
  });
});
