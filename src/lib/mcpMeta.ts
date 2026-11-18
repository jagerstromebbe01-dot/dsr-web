/** Identity of the MCP server, shared by the /mcp endpoint and the registry's server.json. */

export const MCP_REGISTRY_NAME = "io.github.jagerstromebbe01-dot/dsr-web";
export const MCP_TITLE = "DSR Backtest Check";
/** Registry limit: 100 characters. */
export const MCP_DESCRIPTION = "Is a backtest's Sharpe ratio real or luck? Deflated Sharpe Ratio check with green/yellow/red.";
export const MCP_VERSION = "1.0.0";
export const MCP_REPOSITORY_URL = "https://github.com/jagerstromebbe01-dot/dsr-web";

/** Content of /.well-known/mcp/server.json (schema 2025-12-11 of the official MCP registry). */
export function buildServerJson(siteUrl: string) {
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    name: MCP_REGISTRY_NAME,
    title: MCP_TITLE,
    description: MCP_DESCRIPTION,
    version: MCP_VERSION,
    websiteUrl: siteUrl,
    repository: { url: MCP_REPOSITORY_URL, source: "github" },
    remotes: [{ type: "streamable-http", url: `${siteUrl}/mcp` }],
  };
}
