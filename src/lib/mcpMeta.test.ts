import { describe, expect, it } from "vitest";
import { SITE_URL, ROUTES } from "../routes";
import { MCP_DESCRIPTION, buildServerJson } from "./mcpMeta";

describe("server.json (official MCP registry schema 2025-12-11)", () => {
  const json = buildServerJson(SITE_URL);

  it("meets the schema constraints", () => {
    expect(json.$schema).toBe("https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json");
    expect(json.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
    expect(json.name.length).toBeGreaterThanOrEqual(3);
    expect(json.name.length).toBeLessThanOrEqual(200);
    expect(MCP_DESCRIPTION.length).toBeGreaterThanOrEqual(1);
    expect(MCP_DESCRIPTION.length).toBeLessThanOrEqual(100);
    expect(json.title.length).toBeLessThanOrEqual(100);
    expect(json.version).toMatch(/^\d+\.\d+\.\d+$/); // exact semver, no ranges
  });

  it("points at the remote endpoint on the configured domain", () => {
    expect(json.remotes).toEqual([{ type: "streamable-http", url: `${SITE_URL}/mcp` }]);
    expect(json.remotes[0].url).toMatch(/^https?:\/\/[^\s]+$/);
    expect(json.websiteUrl).toBe(SITE_URL);
  });

  it("follows another domain when the config changes", () => {
    expect(buildServerJson("https://example.org").remotes[0].url).toBe("https://example.org/mcp");
  });
});

describe("privacy and terms pages are real routes", () => {
  it("are in the sitemap routes but not the top nav", () => {
    for (const path of ["/privacy", "/terms"]) {
      const route = ROUTES.find((r) => r.path === path);
      expect(route, path).toBeDefined();
      expect(route?.inNav).toBe(false);
    }
  });
});
