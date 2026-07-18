import { describe, expect, it } from "vitest";
import {
  DEFAULT_AS_ISSUER,
  DEFAULT_AS_JWKS_URI,
  DEFAULT_BACKEND_BASE_URL,
  DEFAULT_MCP_CANONICAL_URI,
  DEFAULT_PORT,
  jwksUriForIssuer,
  loadConfig,
  parseArgs,
} from "../src/config.js";

describe("parseArgs", () => {
  it("parses --key=value form", () => {
    const a = parseArgs([
      "--port=9090",
      "--base-url=https://x.dev/fn",
      "--canonical-uri=https://mcp.x.dev/mcp",
      "--as-issuer=https://x.dev/oauth",
    ]);
    expect(a.port).toBe(9090);
    expect(a.backendBaseUrl).toBe("https://x.dev/fn");
    expect(a.canonicalUri).toBe("https://mcp.x.dev/mcp");
    expect(a.asIssuer).toBe("https://x.dev/oauth");
  });

  it("parses --key value form", () => {
    const a = parseArgs(["--as-jwks-uri", "https://x.dev/jwks", "--timeout", "1234"]);
    expect(a.asJwksUri).toBe("https://x.dev/jwks");
    expect(a.timeoutMs).toBe(1234);
  });

  it("ignores unknown flags and non-flags", () => {
    const a = parseArgs(["positional", "--unknown", "x", "--port=7000"]);
    expect(a.port).toBe(7000);
  });
});

describe("loadConfig", () => {
  it("uses production seam defaults when nothing is provided", () => {
    const cfg = loadConfig([], {});
    expect(cfg.port).toBe(DEFAULT_PORT);
    expect(cfg.backendBaseUrl).toBe(DEFAULT_BACKEND_BASE_URL);
    expect(cfg.canonicalUri).toBe(DEFAULT_MCP_CANONICAL_URI);
    expect(cfg.asIssuer).toBe(DEFAULT_AS_ISSUER);
    expect(cfg.asJwksUri).toBe(DEFAULT_AS_JWKS_URI);
    expect(cfg.timeoutMs).toBe(30_000);
  });

  it("prefers CLI args over env", () => {
    const cfg = loadConfig(["--port=1234"], { MCP_PORT: "5555" });
    expect(cfg.port).toBe(1234);
  });

  it("falls back to env", () => {
    const cfg = loadConfig([], {
      MCP_PORT: "5555",
      PAYLOD_BASE_URL: "https://env.dev/fn",
      MCP_CANONICAL_URI: "https://mcp.env.dev/mcp",
      AS_ISSUER: "https://env.dev/oauth",
      AS_JWKS_URI: "https://env.dev/jwks.json",
    });
    expect(cfg.port).toBe(5555);
    expect(cfg.backendBaseUrl).toBe("https://env.dev/fn");
    expect(cfg.canonicalUri).toBe("https://mcp.env.dev/mcp");
    expect(cfg.asIssuer).toBe("https://env.dev/oauth");
    expect(cfg.asJwksUri).toBe("https://env.dev/jwks.json");
  });

  // TD-03 regression: the JWKS URI must FOLLOW the issuer, not be a stranded literal.
  it("derives the JWKS URI from the issuer when AS_JWKS_URI is not set", () => {
    const cfg = loadConfig([], { AS_ISSUER: "https://env.dev/oauth" });
    expect(cfg.asIssuer).toBe("https://env.dev/oauth");
    expect(cfg.asJwksUri).toBe("https://env.dev/oauth/.well-known/jwks.json");
    expect(cfg.asJwksUri).not.toBe(DEFAULT_AS_JWKS_URI);
  });

  it("derives the JWKS URI from an issuer passed as a CLI flag, tolerating a trailing slash", () => {
    const cfg = loadConfig(["--as-issuer=https://cli.dev/oauth/"], {});
    expect(cfg.asJwksUri).toBe("https://cli.dev/oauth/.well-known/jwks.json");
  });

  it("still honours an explicit AS_JWKS_URI that does not live under the issuer", () => {
    const cfg = loadConfig([], {
      AS_ISSUER: "https://env.dev/oauth",
      AS_JWKS_URI: "https://keys.elsewhere.dev/jwks.json",
    });
    expect(cfg.asJwksUri).toBe("https://keys.elsewhere.dev/jwks.json");
  });

  it("keeps the production default JWKS URI consistent with the production issuer", () => {
    expect(DEFAULT_AS_JWKS_URI).toBe(jwksUriForIssuer(DEFAULT_AS_ISSUER));
    expect(DEFAULT_AS_JWKS_URI).toBe("https://paylod.dev/oauth/.well-known/jwks.json");
  });

  it("strips a trailing slash from the backend base url but not the canonical uri", () => {
    const cfg = loadConfig(
      ["--base-url=https://x.dev/fn/", "--canonical-uri=https://mcp.x.dev/mcp"],
      {},
    );
    expect(cfg.backendBaseUrl).toBe("https://x.dev/fn");
    expect(cfg.canonicalUri).toBe("https://mcp.x.dev/mcp");
  });
});
