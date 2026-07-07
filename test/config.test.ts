import { describe, expect, it } from "vitest";
import { keyEnvOf, loadConfig, parseArgs, DEFAULT_BASE_URL } from "../src/config.js";

describe("keyEnvOf", () => {
  it("detects production and sandbox keys", () => {
    expect(keyEnvOf("mp_live_abc")).toBe("production");
    expect(keyEnvOf("mp_test_abc")).toBe("sandbox");
    expect(keyEnvOf("something_else")).toBe("unknown");
  });
});

describe("parseArgs", () => {
  it("parses --key=value form", () => {
    const a = parseArgs(["--api-key=mp_test_1", "--base-url=https://x.dev", "--tools=all"]);
    expect(a.apiKey).toBe("mp_test_1");
    expect(a.baseUrl).toBe("https://x.dev");
    expect(a.tools).toBe("all");
  });

  it("parses --key value form", () => {
    const a = parseArgs(["--api-key", "mp_live_2", "--timeout", "1234"]);
    expect(a.apiKey).toBe("mp_live_2");
    expect(a.timeoutMs).toBe(1234);
  });

  it("ignores unknown flags and non-flags", () => {
    const a = parseArgs(["positional", "--unknown", "x", "--api-key=k"]);
    expect(a.apiKey).toBe("k");
  });

  it("captures session token", () => {
    const a = parseArgs(["--session-token=jwt.abc.def"]);
    expect(a.sessionToken).toBe("jwt.abc.def");
  });
});

describe("loadConfig", () => {
  it("throws when no api key is provided", () => {
    expect(() => loadConfig([], {})).toThrow(/Missing paylod API key/);
  });

  it("prefers CLI args over env", () => {
    const cfg = loadConfig(["--api-key=mp_test_cli"], { PAYLOD_API_KEY: "mp_live_env" });
    expect(cfg.apiKey).toBe("mp_test_cli");
    expect(cfg.keyEnv).toBe("sandbox");
  });

  it("falls back to env and defaults", () => {
    const cfg = loadConfig([], { PAYLOD_API_KEY: "mp_live_env" });
    expect(cfg.apiKey).toBe("mp_live_env");
    expect(cfg.keyEnv).toBe("production");
    expect(cfg.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(cfg.timeoutMs).toBe(30_000);
    expect(cfg.tools).toBeUndefined();
  });

  it("strips trailing slashes from base url", () => {
    const cfg = loadConfig(["--api-key=k", "--base-url=https://x.dev/fn/"], {});
    expect(cfg.baseUrl).toBe("https://x.dev/fn");
  });
});
