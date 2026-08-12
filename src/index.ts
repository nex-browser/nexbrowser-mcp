import { NexBrowserMcpServer, runMcpServer } from './entry/mcp-server.js';
import {
  AUTOMATION_TOOL_SPECS,
  createBrowserAutomationTools
} from './features/browser-automation/index.js';
import {
  createBrowserManagementTools,
  MANAGEMENT_TOOL_SPECS
} from './features/browser-management/browser-tools.js';
import { toToolSchema, type NexApiConfig } from './shared/types.js';
import {
  DEFAULT_NEX_API_HOST,
  DEFAULT_NEX_TIMEOUT,
  MAX_NEX_RESPONSE_BYTES,
  NexApiClient,
  normalizeNexApiHost,
  resolveNexApiConfig
} from './transport/nex-api-client.js';

/**
 * Provides complete management and automation schemas for host previews.
 * Pure spec mapping — importing this module has zero side effects.
 * 为宿主预览提供完整的管理和自动化 schema。
 * 纯规格映射——import 本模块零副作用。
 */
export const TOOLS = [...MANAGEMENT_TOOL_SPECS, ...AUTOMATION_TOOL_SPECS].map(toToolSchema);

/** Embedded-server class used by NexBrowser Agent hosts. 供 NexBrowser Agent 宿主嵌入使用的服务类。 */
export class NexBrowserMCPServer extends NexBrowserMcpServer {}

/**
 * Starts the stdio MCP server, optionally with explicit configuration.
 * 启动 stdio MCP 服务，可选传入显式配置。
 */
export async function runServer(config?: NexApiConfig): Promise<void> {
  await runMcpServer(config);
}

// Stable public surface for embedded hosts and tests; each symbol is documented at its definition.
// 面向内嵌宿主与测试的稳定公开面；各符号的文档见其定义处。
export { bindTools, defineTool, type McpToolSpec, type ToolContext } from './shared/define-tool.js';
export { InvalidArgumentError, NexConfigurationError } from './shared/types.js';
export type {
  ActiveSessionStore,
  McpContent,
  McpToolDefinition,
  McpToolResult,
  NexApiConfig,
  NexApiRequester,
  NexApiResponse
} from './shared/types.js';
export { MCP_SERVER_NAME, MCP_SERVER_VERSION, PKG_VERSION } from './version.js';
export {
  AUTOMATION_TOOL_SPECS,
  createBrowserAutomationTools,
  createBrowserManagementTools,
  DEFAULT_NEX_API_HOST,
  DEFAULT_NEX_TIMEOUT,
  MAX_NEX_RESPONSE_BYTES,
  MANAGEMENT_TOOL_SPECS,
  NexApiClient,
  NexBrowserMcpServer,
  normalizeNexApiHost,
  resolveNexApiConfig,
  runMcpServer
};
