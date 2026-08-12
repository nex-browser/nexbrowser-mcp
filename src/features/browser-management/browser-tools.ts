import { z } from 'zod';
import {
  bindTools,
  defineTool,
  type McpToolSpec,
  type ToolContext
} from '../../shared/define-tool.js';
import { apiErrorResult, errorResult, successResult } from '../../shared/tool-result.js';
import type { McpToolDefinition } from '../../shared/types.js';
import { NexApiClient } from '../../transport/nex-api-client.js';
import {
  BROWSER_ACCOUNTS_ROUTE,
  BROWSER_CLOSE_ROUTE,
  BROWSER_CONNECTION_INFO_ROUTE,
  BROWSER_CREATE_ROUTE,
  BROWSER_OPEN_ROUTE,
  BROWSER_PROXY_ROUTE,
  PROXY_LIST_ROUTE,
  SCREEN_LOAD_ROUTE
} from '../../transport/routes.js';

const browserIdSchema = z.union([z.string(), z.number()]);
const browserIdsSchema = z.union([browserIdSchema, z.array(browserIdSchema)]);
const listBrowsersInputSchema = z
  .object({
    teamId: browserIdSchema.optional(),
    page: z.number().optional(),
    size: z.number().optional(),
    keyword: z.string().optional()
  })
  .passthrough();

/** Matches the desktop create-window dialog's per-request cap. 与桌面端创建弹窗的单次上限一致。 */
export const MAX_CREATE_COUNT = 50;

const overrideSchema = z.record(z.string(), z.unknown());
const createBrowsersInputSchema = z
  .object({
    name: z
      .string()
      .describe('Window title; a batch of more than one appends -01, -02 to this name')
      .optional(),
    count: z.number().int().min(1).max(MAX_CREATE_COUNT).describe('How many to create').optional(),
    groupId: browserIdSchema.describe('Target window group; 0 keeps them ungrouped').optional(),
    remark: z.string().optional(),
    proxyId: browserIdSchema.describe('Proxy to bind; 0 means no proxy').optional(),
    accountIds: browserIdsSchema
      .describe('Platform account IDs to bind, so nex_browser_fill_account can sign in later')
      .optional(),
    pluginIds: browserIdsSchema.optional(),
    startupUrl: z.string().optional(),
    screen: overrideSchema.describe('Raw screen field overrides for the create payload').optional(),
    preference: overrideSchema.describe('Raw preference field overrides').optional(),
    fingerprint: overrideSchema.describe('Raw fingerprint field overrides').optional()
  })
  .passthrough();
const listProxiesInputSchema = z
  .object({
    page: z.number().int().min(1).optional(),
    size: z.number().int().min(1).max(200).optional(),
    keyword: z.string().optional(),
    source: z.string().optional()
  })
  .passthrough();
const bindProxyInputSchema = z
  .object({
    windowId: browserIdsSchema.describe('One window ID or a list of closed window IDs'),
    proxyId: browserIdSchema.describe('Proxy resource ID to bind; 0 removes the proxy binding')
  })
  .passthrough();

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
 * Formats one created environment row, keeping failures visible alongside successes.
 * 格式化单个新建环境行，成功与失败并列展示。
 */
function createdSummary(row: any): string {
  return row?.success
    ? `  - #${row.seq ?? '?'} **${row.name || 'Unnamed'}** windowId ${row.id ?? 'Unknown'}`
    : `  - #${row?.seq ?? '?'} ${row?.name || 'Unnamed'}: ${row?.error || 'Unknown error'}`;
}

/**
 * Formats one bound platform account. Usernames arrive masked and secrets are
 * never present; hasPassword/has2fa only report what nex_browser_fill_account can use.
 * 格式化单个绑定平台账号。用户名已由服务端遮蔽且不含任何密钥；
 * hasPassword/has2fa 仅说明 nex_browser_fill_account 能填哪几项。
 */
function accountSummary(account: any): string {
  return [
    `  - accountId ${account?.accountId ?? 'Unknown'} — **${account?.platformName || 'Unknown platform'}**`,
    `    - Username: ${account?.username || 'N/A'}`,
    `    - Platform URL: ${account?.platformUrl || 'N/A'}`,
    `    - Fillable: username${account?.hasPassword ? ', password' : ''}${account?.has2fa ? ', 2FA code' : ''}`
  ].join('\n');
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

/** Returns only the non-secret proxy fields an Agent needs to select a resource. */
function safeProxy(proxy: any) {
  return {
    id: proxy?.id,
    protocol: proxy?.protocol,
    host: proxy?.host,
    port: proxy?.port,
    activeIp: proxy?.activeIp,
    country: proxy?.country,
    countryCode: proxy?.countryCode,
    region: proxy?.region,
    city: proxy?.city,
    timezone: proxy?.timezone,
    remark: proxy?.remark,
    source: proxy?.source,
    expireTime: proxy?.expireTime,
    state: proxy?.state,
    boundWindowCount: Array.isArray(proxy?.bindScreen) ? proxy.bindScreen.length : 0
  };
}

/** Formats one secret-free proxy selection row. */
function proxySummary(proxy: ReturnType<typeof safeProxy>): string {
  const endpoint = [proxy.host, proxy.port]
    .filter((value) => value !== undefined && value !== '')
    .join(':');
  const location = [proxy.country, proxy.region, proxy.city].filter(Boolean).join(' / ');
  return [
    `ProxyId ${proxy.id ?? 'Unknown'} — **${proxy.remark || endpoint || 'Unnamed proxy'}**`,
    `  - Route: ${String(proxy.protocol || 'UNKNOWN').toUpperCase()} ${endpoint || 'N/A'}`,
    `  - Exit: ${proxy.activeIp || 'Unchecked'}${location ? ` (${location})` : ''}`,
    `  - Bound windows: ${proxy.boundWindowCount}`
  ].join('\n');
}

/** Lists proxy resources without exposing credentials or refresh URLs to the model. */
async function listProxyResources(args: z.output<typeof listProxiesInputSchema>, ctx: ToolContext) {
  const query = new URLSearchParams({
    page: String(args.page ?? 1),
    size: String(args.size ?? 100)
  });
  if (args.keyword) query.set('keyword', args.keyword);
  if (args.source) query.set('source', args.source);
  const response = await ctx.api.request<any>(`${PROXY_LIST_ROUTE}?${query}`, { method: 'GET' });
  if (response.code !== 0) return apiErrorResult('Failed to list proxies', response);

  const payload = response.data || {};
  const rawRows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.rows)
      ? payload.rows
      : Array.isArray(payload)
        ? payload
        : [];
  const rows = rawRows.map(safeProxy);
  const total = Number(payload?.count ?? payload?.total ?? rows.length);
  return successResult(
    rows.length
      ? [`Found ${total} proxy resource(s):`, '', rows.map(proxySummary).join('\n\n')].join('\n')
      : 'No proxy resources found.',
    { rows, total, page: args.page ?? 1, size: args.size ?? 100 }
  );
}

/**
 * Lists managed NexBrowser environments through NexBrowser OpenAPI.
 * 通过 NexBrowser OpenAPI 列出受管的 NexBrowser 环境。
 */
async function listBrowserEnvironments(
  args: z.output<typeof listBrowsersInputSchema>,
  ctx: ToolContext
) {
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
          `Found ${total} NexBrowser managed windows/environments in workspace ${args.teamId ?? 'current'}:`,
          '',
          rows.map(profileSummary).join('\n\n')
        ].join('\n')
      : `No NexBrowser managed windows/environments found in workspace ${args.teamId ?? 'current'}.`,
    { rows, total, page, size }
  );
}

/**
 * Stateless environment management specs. These schemas accept additional
 * Desktop request metadata, while automation action schemas are strict.
 * 无状态环境管理规格。这里允许附加 Desktop 请求元数据；自动化动作 schema 则采用严格模式。
 */
export const MANAGEMENT_TOOL_SPECS: readonly McpToolSpec[] = [
  defineTool({
    name: 'nex_browser_list',
    description:
      "Preferred NexBrowser OpenAPI tool for requests such as 'use NexBrowser to show or count my windows'. Lists managed NexBrowser environments/profiles. Never reports Chrome, Edge, the Codex in-app browser, operating-system application windows, or browser tabs.",
    annotations: { readOnlyHint: true },
    inputSchema: listBrowsersInputSchema,
    execute: listBrowserEnvironments
  }),
  defineTool({
    name: 'nex_proxy_list',
    description:
      'List proxy resources available in the active NexBrowser workspace so a proxyId can be selected for window creation or binding. Credentials are never returned.',
    annotations: { readOnlyHint: true },
    inputSchema: listProxiesInputSchema,
    execute: listProxyResources
  }),
  defineTool({
    name: 'nex_browser_create',
    description:
      "Create NexBrowser environments in the desktop app's active workspace. Every unset field falls back to the desktop create-window defaults (fingerprint, preferences, layout, startup page), and each created window gets its own generated fingerprint, so pass only the fields that must differ.",
    inputSchema: createBrowsersInputSchema,
    execute: async (args, ctx) => {
      // count 的取值范围由 inputSchema 保证，这里只补默认值。
      const response = await ctx.api.request<any>(BROWSER_CREATE_ROUTE, {
        method: 'POST',
        body: JSON.stringify({ ...args, count: args.count ?? 1 })
      });
      if (response.code !== 0) return apiErrorResult('Failed to create browsers', response);
      const data = response.data || {};
      const rows = Array.isArray(data.rows) ? data.rows : [];
      const created = rows.filter((row: any) => row?.success);
      return successResult(
        [
          `Created ${created.length} of ${rows.length} NexBrowser window(s):`,
          '',
          ...rows.map(createdSummary),
          '',
          'Use `nex_browser_open` with the returned windowId to start them.'
        ].join('\n'),
        data
      );
    }
  }),
  defineTool({
    name: 'nex_browser_bind_proxy',
    description:
      'Bind one proxy resource to one or more closed NexBrowser windows. Pass proxyId=0 to remove the binding. Running windows are rejected and must be closed first.',
    annotations: { destructiveHint: true },
    inputSchema: bindProxyInputSchema,
    execute: async (args, ctx) => {
      const ids = windowIds(args.windowId);
      if (!ids.length) return errorResult('Failed to bind proxy: windowId is required');
      const response = await ctx.api.request<any>(BROWSER_PROXY_ROUTE, {
        method: 'POST',
        body: JSON.stringify({ windowId: ids.length === 1 ? ids[0] : ids, proxyId: args.proxyId })
      });
      if (response.code !== 0) return apiErrorResult('Failed to bind proxy', response);
      const data = response.data || {};
      const rows = Array.isArray(data.rows) ? data.rows : [];
      return successResult(
        [
          Number(args.proxyId) === 0
            ? 'Proxy binding removed.'
            : `Proxy ${args.proxyId} binding requested.`,
          `Success: ${data.success ?? rows.filter((row: any) => row?.success).length}`,
          `Failed: ${data.failed ?? rows.filter((row: any) => !row?.success).length}`,
          ...rows
            .filter((row: any) => !row?.success)
            .map((row: any) => `  - Window ${row.windowId}: ${row.error || 'Unknown error'}`)
        ].join('\n'),
        {
          rows,
          proxyId: args.proxyId,
          success: data.success,
          failed: data.failed,
          total: data.total
        }
      );
    }
  }),
  defineTool({
    name: 'nex_browser_open',
    description:
      'Start NexBrowser environments and return per-window status. For multi-window tasks, pass every window ID in one windowId array so Desktop can batch-start and tile them before creating automation sessions.',
    inputSchema: z
      .object({
        teamId: browserIdSchema,
        windowId: browserIdsSchema.describe(
          'One window ID, or all target window IDs in one array for a single batch-start request.'
        )
      })
      .passthrough(),
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
    name: 'nex_browser_connection_info',
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
          : 'No opened browsers found.\n\nUse `nex_browser_open` to open browsers first.',
        { connections }
      );
    }
  }),
  defineTool({
    name: 'nex_browser_close',
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
  }),
  defineTool({
    name: 'nex_browser_accounts',
    description:
      'List the platform accounts bound to NexBrowser environments. Usernames come back masked and passwords and 2FA secrets are never returned; call nex_browser_fill_account with an accountId from here to sign in.',
    annotations: { readOnlyHint: true },
    inputSchema: z.object({ windowId: browserIdsSchema }).passthrough(),
    execute: async (args, ctx) => {
      const ids = windowIds(args.windowId);
      if (!ids.length) return errorResult('Failed to get bound accounts: windowId is required');
      const query = new URLSearchParams({ windowId: ids.join(',') });
      const response = await ctx.api.request<any[]>(`${BROWSER_ACCOUNTS_ROUTE}?${query}`, {
        method: 'GET'
      });
      if (response.code !== 0) return apiErrorResult('Failed to get bound accounts', response);
      const rows = Array.isArray(response.data) ? response.data : [];
      return successResult(
        rows
          .map((row) =>
            [
              `**${row?.windowName || 'Unnamed'}** (${row?.windowId ?? 'Unknown'})`,
              ...(row?.accounts?.length
                ? row.accounts.map(accountSummary)
                : ['  - No platform account is bound to this window.'])
            ].join('\n')
          )
          .join('\n\n') || 'No windows matched.',
        { rows }
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
