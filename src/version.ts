/**
 * Single source of truth for version numbers across CLI and MCP serverInfo.
 * 版本号唯一出处，供 CLI 与 MCP serverInfo 共用。
 */

/** Package version surfaced by the CLI. Must match package.json. 包版本，由 CLI 输出，必须与 package.json 一致。 */
export const PKG_VERSION = '2026.8.12-beta.1';

/** MCP serverInfo version. MCP serverInfo 版本。 */
export const MCP_SERVER_VERSION = PKG_VERSION;

/** MCP serverInfo name. MCP serverInfo 名称。 */
export const MCP_SERVER_NAME = 'nexbrowser-mcp';
