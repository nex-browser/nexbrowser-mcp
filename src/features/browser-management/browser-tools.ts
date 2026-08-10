import { z } from 'zod';
import { bindTools, defineTool, type McpToolSpec } from '../../shared/define-tool.js';
import { apiErrorResult, errorResult, successResult } from '../../shared/tool-result.js';
import type { McpToolDefinition } from '../../shared/types.js';
import { NexApiClient } from '../../transport/nex-api-client.js';
import {
  BROWSER_CLOSE_ROUTE,
  BROWSER_CONNECTION_INFO_ROUTE,
  BROWSER_OPEN_ROUTE,
  SCREEN_LOAD_ROUTE
} from '../../transport/routes.js';

const browserIdSchema = z.union([z.string(), z.number()]);
const browserIdsSchema = z.union([browserIdSchema, z.array(browserIdSchema)]);

/**
 * Coerces a scalar or array into an ID list, silently dropping null/undefined/empty-string entries.
 * 将标量或数组统一为 ID 列表，并静默剔除 null/undefined/空字符串项。
 */
function windowIds(value: unknown): Array<string | number> {
  const values = Array.isArray(value) ? value : [value];
  return values.filter(
    (item): item is string | number => item !== undefined && item !== null && item !== ''
  );
}

/**
 * Formats running-browser connection metadata for human-readable MCP output, tolerating the API's field-name variants (ws/cdpEndpoint/cdpUrl, http/cdpHttpEndpoint).
 * 格式化运行中浏览器的连接信息供 MCP 人类可读输出使用，兼容 API 的多种字段名变体（ws/cdpEndpoint/cdpUrl、http/cdpHttpEndpoint）。
 */
function connectionSummary(connection: any, exposeCdp: boolean): string {
  const lines = [
    `**${connection.windowName || 'Unnamed'}** (${connection.windowId || connection.id || 'Unknown'})`,
    `  - PID: ${connection.pid ?? 'N/A'}`
  ];
  if (exposeCdp) {
    lines.push(
      `  - CDP WebSocket: \`${connection.ws || connection.cdpEndpoint || connection.cdpUrl || 'N/A'}\``,
      `  - HTTP Endpoint: \`${connection.http || connection.cdpHttpEndpoint || 'N/A'}\``
    );
  }
  return lines.join('\n');
}

/** Removes debugging endpoints unless the operator explicitly opts in. */
function safeConnection<T extends Record<string, any>>(connection: T, exposeCdp: boolean): T {
  if (exposeCdp) return connection;
  const sanitized = { ...connection };
  for (const key of ['ws', 'cdpEndpoint', 'cdpUrl', 'http', 'cdpHttpEndpoint']) {
    delete sanitized[key];
  }
  return sanitized;
}

/**
 * Formats one browser environment row for a compact list.
 * 格式化单个浏览器环境行以用于紧凑列表。
 */
function profileSummary(profile: any): string {
  const windowId = profile.id ?? 'Unknown';
  return [
    `Sequence: ${profile.seq ?? 'Unknown'}`,
    `  - WindowId: ${windowId}`,
    `  - Environment: **${profile.windowName || profile.name || `Window ${windowId}`}**`,
    `  - Status: ${profile.opened === 'ON' ? 'Open' : 'Closed'}`
  ].join('\n');
}

/**
 * Stateless environment management specs. These schemas accept additional
 * Desktop request metadata, while automation action schemas are strict.
 * 无状态环境管理规格。这里允许附加 Desktop 请求元数据；自动化动作 schema 则采用严格模式。
 */
export const MANAGEMENT_TOOL_SPECS: readonly McpToolSpec[] = [
  defineTool({
    name: 'nex_list_browsers',
    description:
      'List or count NexBrowser browser environments (also called NexBrowser windows or profiles) without starting them. This does not list operating-system application windows.',
    annotations: { readOnlyHint: true },
    inputSchema: z
      .object({
        teamId: browserIdSchema.optional(),
        page: z.number().optional(),
        size: z.number().optional(),
        keyword: z.string().optional()
      })
      .passthrough(),
    execute: async (args, ctx) => {
      const page = Number(args.page) > 0 ? Number(args.page) : 1;
      const size = Number(args.size) > 0 ? Number(args.size) : 100;
      const response = await ctx.api.request<any>(SCREEN_LOAD_ROUTE, {
        method: 'POST',
        body: JSON.stringify({
          page,
          size,
          ...(args.teamId ? { teamId: args.teamId } : {}),
          ...(args.keyword ? { keyword: String(args.keyword) } : {})
        })
      });
      if (response.code !== 0) return apiErrorResult('Failed to list browsers', response);
      const rows = Array.isArray(response.data?.data) ? response.data.data : [];
      const total = Number(response.data?.count ?? response.data?.total ?? rows.length);
      return successResult(
        rows.length
          ? [
              `Found ${total} browsers in workspace ${args.teamId ?? 'current'}:`,
              '',
              rows.map(profileSummary).join('\n\n')
            ].join('\n')
          : `No browsers found in workspace ${args.teamId ?? 'current'}.`,
        { rows, total, page, size }
      );
    }
  }),
  defineTool({
    name: 'nex_open_browsers',
    description: 'Start one or more NexBrowser environments and return their status.',
    inputSchema: z.object({ teamId: browserIdSchema, windowId: browserIdsSchema }).passthrough(),
    execute: async (args, ctx) => {
      const ids = windowIds(args.windowId);
      if (!args.teamId || !ids.length) {
        return errorResult('Failed to open browsers: teamId and windowId are required');
      }
      const response = await ctx.api.request<any>(BROWSER_OPEN_ROUTE, {
        method: 'POST',
        body: JSON.stringify({ teamId: args.teamId, id: ids.length === 1 ? ids[0] : ids })
      });
      if (response.code !== 0) return apiErrorResult('Failed to open browsers', response);
      const rows = Array.isArray(response.data?.rows) ? response.data.rows : [response.data];
      const outcomes = ids.map((windowId, index) => ({
        windowId,
        success: rows[index]?.success !== false,
        data: safeConnection(rows[index] ?? {}, ctx.api.exposeCdp === true),
        error: rows[index]?.error
      }));
      const success = outcomes.filter((item) => item.success);
      const failed = outcomes.filter((item) => !item.success);
      return successResult(
        [
          `Team: ${args.teamId}`,
          `Total Requests: ${ids.length}`,
          `Success: ${success.length}`,
          `Failed: ${failed.length}`,
          '',
          ...success.map((item) =>
            connectionSummary(item.data || { id: item.windowId }, ctx.api.exposeCdp === true)
          ),
          ...failed.map((item) => `  - ${item.windowId}: ${item.error || 'Unknown error'}`)
        ].join('\n'),
        { rows: outcomes, success: success.length, failed: failed.length, total: ids.length }
      );
    }
  }),
  defineTool({
    name: 'nex_get_connection_info',
    description: 'Inspect the status of running NexBrowser environments.',
    annotations: { readOnlyHint: true },
    inputSchema: z.object({ teamId: browserIdSchema, windowId: browserIdsSchema }).passthrough(),
    execute: async (args, ctx) => {
      const ids = windowIds(args.windowId);
      if (!args.teamId || !ids.length) {
        return errorResult('Failed to get connection info: teamId and windowId are required');
      }
      const query = new URLSearchParams({ teamId: String(args.teamId), windowId: ids.join(',') });
      const response = await ctx.api.request<any[]>(`${BROWSER_CONNECTION_INFO_ROUTE}?${query}`, {
        method: 'GET'
      });
      if (response.code !== 0) return apiErrorResult('Failed to get connection info', response);
      const connections = (Array.isArray(response.data) ? response.data : []).map((connection) =>
        safeConnection(connection, ctx.api.exposeCdp === true)
      );
      return successResult(
        connections.length
          ? [
              `Found ${connections.length} opened browser(s):`,
              '',
              ...connections.map((connection) =>
                connectionSummary(connection, ctx.api.exposeCdp === true)
              )
            ].join('\n')
          : 'No opened browsers found.\n\nUse `nex_open_browsers` to open browsers first.',
        { connections }
      );
    }
  }),
  defineTool({
    name: 'nex_close_browsers',
    description: 'Close one or more NexBrowser environments.',
    annotations: { destructiveHint: true },
    inputSchema: z
      .object({ teamId: browserIdSchema.optional(), windowId: browserIdsSchema })
      .passthrough(),
    execute: async (args, ctx) => {
      const ids = windowIds(args.windowId);
      if (!ids.length) return errorResult('Failed to close browsers: windowId is required');
      const response = await ctx.api.request<Record<string, unknown>>(BROWSER_CLOSE_ROUTE, {
        method: 'POST',
        body: JSON.stringify({
          ...(args.teamId ? { teamId: args.teamId } : {}),
          ids: ids.map(String)
        })
      });
      if (response.code !== 0) return apiErrorResult('Failed to close browsers', response);
      const data = response.data || {};
      return successResult(
        `Successfully closed ${typeof data.success === 'number' ? data.success : ids.length} browser(s)`,
        data
      );
    }
  })
];

/**
 * Binds the management specs to a live client, which also fills the ToolContext session-store slot even though these stateless tools never read session state.
 * 将管理规格绑定到运行中的客户端；该客户端同时充当 ToolContext 的会话存储位，尽管这些无状态工具从不读取会话状态。
 */
export function createBrowserManagementTools(client: NexApiClient): McpToolDefinition[] {
  return bindTools(MANAGEMENT_TOOL_SPECS, { api: client, sessions: client });
}
