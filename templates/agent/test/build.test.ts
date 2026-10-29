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
      { SANDBOX_IMAGE: "docker.io/cloudflare/sandbox:0.12.9" },
    );
    expect(config["main"]).toBe("worker.js");
    expect(config["vars"]).toEqual({ MODEL: "x" });
    expect(config["unknownKey"]).toBeUndefined();
    expect(config["containers"]).toEqual([
      { class_name: "AgentSandbox", image: "docker.io/cloudflare/sandbox:0.12.9" },
    ]);
  });

  test("Settings env bakes every AI var over the committed fallbacks", () => {
    const config = deriveCelldConfig(
      { vars: { MODEL: "committed", OPENAI_API_KEY: "placeholder" } },
      {
        MODEL: "custom-model",
        OPENAI_API_KEY: "build-time-token",
        OPENAI_BASE_URL: "https://gateway.example/openai",
      }
    );
    expect(config["vars"]).toEqual({
      MODEL: "custom-model",
      OPENAI_API_KEY: "build-time-token",
      OPENAI_BASE_URL: "https://gateway.example/openai",
    });
  });

  test("empty build env leaves committed vars alone; missing vars become {}", () => {
    const config = deriveCelldConfig({ vars: { MODEL: "x" } }, {});
    expect(config["vars"]).toEqual({ MODEL: "x" });
    expect(deriveCelldConfig({})["vars"]).toEqual({});
  });

  test("keeps the committed image without an override", () => {
    const config = deriveCelldConfig({ containers: [{ image: "keep" }] }, {});
    expect(config["containers"]).toEqual([{ image: "keep" }]);
  });
});
