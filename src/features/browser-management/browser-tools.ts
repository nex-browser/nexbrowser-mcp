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
  ACCOUNT_BATCH_CREATE_ROUTE,
  ACCOUNT_CREATE_ROUTE,
  ACCOUNT_DELETE_ROUTE,
  ACCOUNT_LIST_ROUTE,
  ACCOUNT_MODIFY_ROUTE,
  BROWSER_ACCOUNT_ROUTE,
  BROWSER_ACCOUNTS_ROUTE,
  BROWSER_CLOSE_ROUTE,
  BROWSER_CONNECTION_INFO_ROUTE,
  BROWSER_CREATE_ROUTE,
  BROWSER_GROUP_ROUTE,
  BROWSER_LIST_ROUTE,
  BROWSER_OPEN_ROUTE,
  BROWSER_PROXY_ROUTE,
  GROUP_CREATE_ROUTE,
  GROUP_DELETE_ROUTE,
  GROUP_LIST_ROUTE,
  GROUP_MODIFY_ROUTE,
  PROXY_BATCH_CREATE_ROUTE,
  PROXY_CREATE_ROUTE,
  PROXY_DELETE_ROUTE,
  PROXY_DETECT_ROUTE,
  PROXY_IMPORT_ROUTE,
  PROXY_LIST_ROUTE,
  PROXY_MODIFY_ROUTE
} from '../../transport/routes.js';

const browserIdSchema = z.union([z.string(), z.number()]);
const browserIdsSchema = z.union([browserIdSchema, z.array(browserIdSchema)]);
const listBrowsersInputSchema = z
  .object({
    teamId: browserIdSchema.optional(),
    page: z.number().optional(),
    size: z.number().optional(),
    keyword: z.string().optional(),
    groupId: browserIdSchema
      .describe('Filter by window group from nex_browser_group_list; 0 lists ungrouped windows')
      .optional()
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
    size: z.number().int().min(1).max(1000).optional(),
    keyword: z.string().optional(),
    source: z.string().optional(),
    state: z
      .union([z.number().int(), z.array(z.number().int())])
      .describe('Status filter; repeat as state=1&state=0. 0 unchecked, 1 ok, 2 deleted')
      .optional()
  })
  .passthrough();
const importProxiesInputSchema = z
  .object({
    text: z
      .string()
      .describe(
        'One proxy per line, copied from the current user request. Formats: protocol://user:pass@host:port {remark}, protocol://host:port:user:pass {remark}, user:pass@host:port, host:port:user:pass. Protocols: HTTP, HTTPS, SOCKS5; omitted protocol defaults to SOCKS5. IPv6 hosts use [address]:port.'
      )
      .optional(),
    lines: z
      .array(z.string())
      .describe('Alternative to text: each entry is one Desktop-compatible proxy import line')
      .optional()
  })
  .passthrough();
const bindProxyInputSchema = z
  .object({
    windowId: browserIdsSchema
      .describe('One window ID or a list of closed window IDs; alias of windowIds')
      .optional(),
    windowIds: browserIdsSchema.describe('Documented alias of windowId').optional(),
    proxyId: browserIdSchema.describe('Proxy resource ID to bind; 0 removes the proxy binding')
  })
  .passthrough();
const bindAccountInputSchema = z
  .object({
    windowId: browserIdsSchema
      .describe('One window ID or a list of closed window IDs; alias of windowIds')
      .optional(),
    windowIds: browserIdsSchema.describe('Documented alias of windowId').optional(),
    accountIds: browserIdsSchema.describe(
      'Catalog account IDs that replace the window binding; [] or 0 removes all bound accounts'
    )
  })
  .passthrough();
const createGroupInputSchema = z
  .object({
    name: z.string().describe('Group name; it must be unique inside the active team'),
    seq: z.number().int().describe('Sort order; defaults to the end of the list').optional()
  })
  .passthrough();
const deleteGroupInputSchema = z
  .object({
    groupId: browserIdSchema
      .describe('Custom group ID to delete; the ungrouped bucket 0 is rejected')
      .optional(),
    id: browserIdSchema.describe('Documented alias of groupId').optional()
  })
  .passthrough();
const moveToGroupInputSchema = z
  .object({
    windowId: browserIdsSchema
      .describe('One window ID or a list of window IDs; alias of windowIds')
      .optional(),
    windowIds: browserIdsSchema.describe('Documented alias of windowId').optional(),
    groupId: browserIdSchema.describe(
      'Target group ID from nex_browser_group_list; 0 moves the windows out of any group'
    )
  })
  .passthrough();
const proxyProtocolSchema = z
  .string()
  .describe('SOCKS5, HTTP, or HTTPS; omitted create defaults to SOCKS5');
const proxyPortSchema = z.union([z.string(), z.number()]).describe('Proxy port');
const proxyItemInputSchema = z
  .object({
    protocol: proxyProtocolSchema.optional(),
    host: z.string().describe('Proxy host or IP'),
    port: proxyPortSchema,
    ipVersion: z.string().describe('IPv4 or IPv6').optional(),
    username: z.string().describe('Write-only; never returned').optional(),
    password: z.string().describe('Write-only; never returned').optional(),
    remark: z.string().optional()
  })
  .passthrough();
const createProxyInputSchema = z
  .object({
    protocol: proxyProtocolSchema.optional(),
    host: z.string().describe('Proxy host or IP; required unless items is set').optional(),
    port: proxyPortSchema.optional(),
    ipVersion: z.string().describe('IPv4 or IPv6').optional(),
    username: z.string().describe('Write-only; never returned').optional(),
    password: z.string().describe('Write-only; never returned').optional(),
    remark: z.string().optional(),
    items: z
      .array(proxyItemInputSchema)
      .describe('Create several proxies in one call; each item needs host and port')
      .optional()
  })
  .passthrough();
const modifyProxyInputSchema = z
  .object({
    proxyId: browserIdSchema.describe('Existing proxy resource ID from nex_proxy_list').optional(),
    id: browserIdSchema.describe('Documented alias of proxyId').optional(),
    protocol: proxyProtocolSchema.optional(),
    host: z.string().optional(),
    port: proxyPortSchema.optional(),
    ipVersion: z.string().describe('IPv4 or IPv6').optional(),
    username: z.string().describe('Write-only; never returned').optional(),
    password: z.string().describe('Write-only; never returned').optional(),
    remark: z.string().optional()
  })
  .passthrough();
const deleteProxyInputSchema = z
  .object({
    proxyId: browserIdsSchema.describe('One proxy ID or a list of proxy IDs to delete').optional(),
    proxyIds: browserIdsSchema.describe('Alias of proxyId').optional(),
    items: browserIdsSchema.describe('Documented alias of proxyId').optional(),
    id: browserIdSchema.describe('Single-ID alias of proxyId').optional()
  })
  .passthrough();
const detectProxyInputSchema = z
  .object({
    proxyId: browserIdSchema
      .describe('Saved proxy ID to detect; omit when passing host and port')
      .optional(),
    id: browserIdSchema.describe('Documented alias of proxyId').optional(),
    protocol: proxyProtocolSchema.optional(),
    host: z.string().optional(),
    port: proxyPortSchema.optional(),
    username: z.string().describe('Write-only; never returned').optional(),
    password: z.string().describe('Write-only; never returned').optional()
  })
  .passthrough();
const modifyGroupInputSchema = z
  .object({
    groupId: browserIdSchema
      .describe('Custom group ID to rename or reorder; the ungrouped bucket 0 is rejected')
      .optional(),
    id: browserIdSchema.describe('Documented alias of groupId').optional(),
    name: z.string().describe('New unique group name').optional(),
    seq: z.number().int().describe('New sort order').optional()
  })
  .passthrough();
const listAccountsInputSchema = z
  .object({
    teamId: browserIdSchema.optional(),
    page: z.number().int().min(1).optional(),
    size: z.number().int().min(1).max(1000).optional(),
    keyword: z.string().optional()
  })
  .passthrough();
const accountItemInputSchema = z
  .object({
    teamId: browserIdSchema.optional(),
    platformUrl: z.string().describe('Platform website URL, for example https://www.tiktok.com'),
    platformName: z.string().describe('Display name for the platform').optional(),
    username: z.string().describe('Login username or email').optional(),
    password: z.string().describe('Write-only; never returned').optional(),
    key2fa: z.string().describe('Write-only authenticator secret; never returned').optional(),
    remark: z.string().optional()
  })
  .passthrough();
const createAccountInputSchema = accountItemInputSchema;
const batchCreateAccountInputSchema = z
  .object({
    items: z
      .array(accountItemInputSchema)
      .describe('Account objects; each item needs platformUrl. Also accepts accounts or accountList')
  })
  .passthrough();
const modifyAccountInputSchema = z
  .object({
    accountId: browserIdSchema.describe('Platform account ID from nex_account_list').optional(),
    id: browserIdSchema.describe('Documented alias of accountId').optional(),
    teamId: browserIdSchema.optional(),
    platformUrl: z.string().optional(),
    platformName: z.string().optional(),
    username: z.string().optional(),
    password: z.string().describe('Write-only; never returned').optional(),
    key2fa: z.string().describe('Write-only authenticator secret; never returned').optional(),
    remark: z.string().optional()
  })
  .passthrough();
const deleteAccountInputSchema = z
  .object({
    accountId: browserIdsSchema.describe('One account ID or a list of account IDs to delete').optional(),
    accountIds: browserIdsSchema.describe('Alias of accountId').optional(),
    items: browserIdsSchema.describe('Documented alias of accountId').optional(),
    id: browserIdSchema.describe('Single-ID alias of accountId').optional()
  })
  .passthrough();
const batchCreateProxyInputSchema = z
  .object({
    items: z
      .array(proxyItemInputSchema)
      .describe('Proxy objects; each item needs host and port. Also accepts proxies or proxyList')
  })
  .passthrough();

const SUPPORTED_PROXY_PROTOCOLS = new Set(['SOCKS5', 'HTTP', 'HTTPS']);

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

/** Reads the first non-empty ID list among documented and MCP-friendly aliases. 0 is a valid ID. 在文档名与 MCP 名之间取第一份非空 ID 列表；0 也是合法 ID。 */
function firstIds(args: Record<string, unknown>, keys: readonly string[]): Array<string | number> {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(args, key)) continue;
    const ids = windowIds(args[key]);
    if (ids.length) return ids;
  }
  return [];
}

/** True when any alias is present, including 0 or an explicit empty array. 任一别名出现即视为已传，含 0 与空数组。 */
function hasAlias(args: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some((key) => {
    if (!Object.prototype.hasOwnProperty.call(args, key)) return false;
    const value = args[key];
    return value !== undefined && value !== null && value !== '';
  });
}

/** Reads the first defined scalar among aliases; 0 is a valid ID. 在别名中取第一个已定义标量；0 也是合法 ID。 */
function firstScalar<T = string | number>(
  args: Record<string, unknown>,
  keys: readonly string[]
): T | undefined {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(args, key)) continue;
    const value = args[key];
    if (value !== undefined && value !== null && value !== '') return value as T;
  }
  return undefined;
}

/** Collects a documented items[] list, also accepting accounts/accountList or proxies/proxyList. 读取文档中的 items，并兼容 accounts/accountList、proxies/proxyList。 */
function writeItems(args: Record<string, unknown>, aliases: readonly string[]): unknown[] {
  for (const key of aliases) {
    if (Array.isArray(args[key])) return args[key] as unknown[];
  }
  return [];
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
 * Formats one vault credential. Usernames arrive masked and secrets are
 * never present; hasPassword/has2fa only report what nex_browser_fill_account can use.
 * 格式化单个保险库凭据。用户名已由服务端遮蔽且不含任何密钥；
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

/** Reads Desktop-compatible import text from either `text` or `lines`. 从 text 或 lines 读取桌面端兼容的导入文本。 */
function proxyImportText(args: { text?: string; lines?: string[] }): string {
  if (typeof args.text === 'string' && args.text.trim()) return args.text;
  if (Array.isArray(args.lines) && args.lines.length) return args.lines.join('\n');
  return '';
}

/** Drops original import lines so credentials never leave the MCP boundary. 去掉原始导入行，避免凭据离开 MCP 边界。 */
function safeImportInvalid(invalid: unknown): Array<{ index: number; error: string }> {
  if (!Array.isArray(invalid)) return [];
  return invalid.map((row: any, index: number) => ({
    index: index + 1,
    error: String(row?.error || 'Unrecognized proxy line')
  }));
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

/**
 * Formats one window group row for selection by ID. Group 0 is the synthetic
 * ungrouped bucket Desktop always returns first; it cannot be renamed or deleted.
 * 格式化单个窗口分组行供按 ID 选择。分组 0 是 Desktop 恒定返回在首位的合成「未分组」，不可改名或删除。
 */
function groupSummary(group: any): string {
  const id = group?.id ?? 'Unknown';
  return [
    `GroupId ${id} — **${group?.name || 'Unnamed group'}**${String(id) === '0' ? ' (ungrouped, not editable)' : ''}`,
    `  - Windows: ${Number(group?.screenCount || 0)}`,
    `  - Sort order: ${group?.seq ?? 'Unknown'}`
  ].join('\n');
}

/** Normalizes a proxy protocol label; create falls back to SOCKS5. 规范化代理协议名；新建时缺省为 SOCKS5。 */
function normalizeProxyProtocol(value: unknown, fallback?: string): string | undefined {
  const raw = value === undefined || value === null || value === '' ? fallback : String(value);
  if (raw === undefined) return undefined;
  return raw.trim().toUpperCase();
}

/** Returns only catalog fields an Agent needs to select a platform account. 只保留 Agent 选择平台账号所需的目录字段。 */
function safeAccount(account: any) {
  return {
    id: account?.id ?? account?.accountId,
    platformUrl: account?.platformUrl || account?.url || account?.platform?.url,
    platformName: account?.platformName || account?.name || account?.platform?.name,
    username: account?.username || account?.account,
    remark: account?.remark,
    hasPassword: Boolean(account?.password || account?.hasPassword),
    has2fa: Boolean(account?.key2fa || account?.has2fa),
    boundWindowCount: Array.isArray(account?.bindScreen) ? account.bindScreen.length : 0,
    state: account?.state
  };
}

/** Formats one secret-free platform-account catalog row. */
function accountCatalogSummary(account: ReturnType<typeof safeAccount>): string {
  return [
    `AccountId ${account.id ?? 'Unknown'} — **${account.platformName || account.platformUrl || 'Unknown platform'}**`,
    `  - Username: ${account.username || 'N/A'}`,
    `  - Platform URL: ${account.platformUrl || 'N/A'}`,
    `  - Stored: username${account.hasPassword ? ', password' : ''}${account.has2fa ? ', 2FA secret' : ''}`,
    `  - Bound windows: ${account.boundWindowCount}`
  ].join('\n');
}

/** Collects pager or save-result rows from a list/save OpenAPI envelope. */
function payloadRows(data: unknown): any[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const payload = data as Record<string, unknown>;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.items)) return payload.items;
  if (payload.id !== undefined || payload.accountId !== undefined) return [payload];
  return [];
}

/** Builds a write payload and omits blank secrets so modify cannot wipe stored values. 构造写入载荷，空白密钥不发送，避免修改时清空已存密钥。 */
function accountWriteFields(args: {
  accountId?: string | number;
  teamId?: string | number;
  platformUrl?: string;
  platformName?: string;
  username?: string;
  password?: string;
  key2fa?: string;
  remark?: string;
}): Record<string, unknown> {
  const item: Record<string, unknown> = {};
  if (args.accountId !== undefined) item.id = args.accountId;
  if (args.teamId !== undefined) item.teamId = args.teamId;
  if (args.platformUrl !== undefined) item.platformUrl = String(args.platformUrl).trim();
  if (args.platformName !== undefined) item.platformName = String(args.platformName).trim();
  if (args.username !== undefined) item.username = String(args.username).trim();
  if (typeof args.password === 'string' && args.password.length) item.password = args.password;
  if (typeof args.key2fa === 'string' && args.key2fa.length) item.key2fa = args.key2fa;
  if (args.remark !== undefined) item.remark = args.remark;
  return item;
}

/** Builds one custom-proxy write item; create defaults protocol to SOCKS5. 构造一条自定义代理写入项；新建时协议缺省 SOCKS5。 */
function proxyWriteFields(
  args: {
    protocol?: string;
    host?: string;
    port?: string | number;
    ipVersion?: string;
    username?: string;
    password?: string;
    remark?: string;
  },
  options?: { defaultProtocol?: string }
): { item?: Record<string, unknown>; error?: string } {
  const host = String(args.host || '').trim();
  const port = args.port === undefined || args.port === '' ? '' : String(args.port).trim();
  const protocol = normalizeProxyProtocol(args.protocol, options?.defaultProtocol);
  if (!host || !port) return { error: 'host and port are required' };
  if (protocol && !SUPPORTED_PROXY_PROTOCOLS.has(protocol)) {
    return { error: 'protocol must be SOCKS5, HTTP, or HTTPS' };
  }
  return {
    item: {
      ...(protocol ? { protocol } : {}),
      host,
      port,
      source: 'CUSTOM',
      ...(args.ipVersion === undefined ? {} : { ipVersion: String(args.ipVersion).trim() }),
      ...(typeof args.username === 'string' ? { username: args.username } : {}),
      ...(typeof args.password === 'string' ? { password: args.password } : {}),
      ...(args.remark === undefined ? {} : { remark: args.remark })
    }
  };
}

/** Formats a successful proxy-create result without echoing credentials. */
function createdProxyResult(rows: ReturnType<typeof safeProxy>[]) {
  const created = rows[0];
  return successResult(
    rows.length > 1
      ? `Created ${rows.length} proxy resource(s).`
      : created
        ? `Created proxy resource with proxyId ${created.id ?? 'unknown'}.`
        : 'Created proxy resource.',
    { rows }
  );
}

/** Formats a successful account-create result without echoing secrets. */
function createdAccountResult(rows: ReturnType<typeof safeAccount>[]) {
  const created = rows[0];
  return successResult(
    rows.length > 1
      ? `Created ${rows.length} platform account(s).`
      : created
        ? `Created platform account with accountId ${created.id ?? 'unknown'}.`
        : 'Created platform account.',
    { rows }
  );
}

/** Keeps detect evidence and drops any credential fields the probe may echo. 保留检测证据并去掉探测结果里可能回显的凭据。 */
function safeDetectResult(data: any): Record<string, unknown> {
  const proxy = safeProxy(data);
  return {
    ...proxy,
    ms: data?.ms,
    query: data?.query,
    ip: data?.ip,
    status: data?.status,
    message: data?.message
  };
}

/** Summarizes a per-window batch result shared by the proxy-bind and group-move tools. */
function batchOutcomeLines(data: any, rows: any[]): string[] {
  return [
    `Success: ${data.success ?? rows.filter((row: any) => row?.success).length}`,
    `Failed: ${data.failed ?? rows.filter((row: any) => !row?.success).length}`,
    ...rows
      .filter((row: any) => !row?.success)
      .map((row: any) => `  - Window ${row.windowId}: ${row.error || 'Unknown error'}`)
  ];
}

/** Lists proxy resources without exposing credentials or refresh URLs to the model. */
async function listProxyResources(args: z.output<typeof listProxiesInputSchema>, ctx: ToolContext) {
  const query = new URLSearchParams({
    page: String(args.page ?? 1),
    size: String(args.size ?? 100)
  });
  if (args.keyword) query.set('keyword', args.keyword);
  if (args.source) query.set('source', args.source);
  if (args.state !== undefined) {
    const states = Array.isArray(args.state) ? args.state : [args.state];
    for (const state of states) query.append('state', String(state));
  }
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
  const query = new URLSearchParams({ page: String(page), size: String(size) });
  if (args.teamId) query.set('teamId', String(args.teamId));
  if (args.keyword) query.set('keyword', String(args.keyword));
  if (args.groupId !== undefined) query.set('groupId', String(args.groupId));
  const response = await ctx.api.request<any>(`${BROWSER_LIST_ROUTE}?${query}`, { method: 'GET' });
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
    name: 'nex_proxy_import',
    description:
      'Import custom proxy resources from Desktop-compatible text lines the user supplied in the current request. Supported protocols are HTTP, HTTPS, and SOCKS5. Credentials are never returned.',
    inputSchema: importProxiesInputSchema,
    execute: async (args, ctx) => {
      const text = proxyImportText(args);
      if (!text.trim()) {
        return errorResult('Failed to import proxies: text or lines is required');
      }
      const response = await ctx.api.request<any>(PROXY_IMPORT_ROUTE, {
        method: 'POST',
        body: JSON.stringify(
          typeof args.text === 'string' && args.text.trim() ? { text } : { lines: args.lines }
        )
      });
      if (response.code !== 0) return apiErrorResult('Failed to import proxies', response);
      const data = response.data || {};
      const rawItems = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
      const rows = rawItems.map(safeProxy);
      const invalid = safeImportInvalid(data.invalid);
      const lines = [`Imported ${Number(data.imported ?? rows.length)} proxy resource(s).`];
      if (Number(data.duplicateCount) > 0) {
        lines.push(`Duplicates skipped: ${data.duplicateCount}`);
      }
      if (rows.length) lines.push('', ...rows.map(proxySummary));
      if (invalid.length) {
        lines.push(
          '',
          `Unrecognized lines: ${invalid.length}`,
          ...invalid.map((row) => `  - Line ${row.index}: ${row.error}`)
        );
      }
      return successResult(lines.join('\n'), {
        rows,
        imported: data.imported ?? rows.length,
        duplicateCount: data.duplicateCount ?? 0,
        invalid
      });
    }
  }),
  defineTool({
    name: 'nex_proxy_create',
    description:
      'Create one custom proxy resource from protocol, host, and port, or pass items to create several. Prefer nex_proxy_import when the user pasted Desktop-compatible lines. Credentials are never returned.',
    inputSchema: createProxyInputSchema,
    execute: async (args, ctx) => {
      const items = writeItems(args, ['items', 'proxies', 'proxyList']);
      if (items.length) {
        const normalized = [];
        for (const raw of items) {
          const built = proxyWriteFields(raw as Record<string, any>, { defaultProtocol: 'SOCKS5' });
          if (built.error || !built.item) {
            return errorResult(`Failed to create proxy: ${built.error || 'invalid item'}`);
          }
          normalized.push(built.item);
        }
        const response = await ctx.api.request<any>(PROXY_CREATE_ROUTE, {
          method: 'POST',
          body: JSON.stringify({ items: normalized })
        });
        if (response.code !== 0) return apiErrorResult('Failed to create proxy', response);
        return createdProxyResult(payloadRows(response.data).map(safeProxy));
      }
      const built = proxyWriteFields(args, { defaultProtocol: 'SOCKS5' });
      if (built.error || !built.item) {
        return errorResult(`Failed to create proxy: ${built.error || 'host and port are required'}`);
      }
      const response = await ctx.api.request<any>(PROXY_CREATE_ROUTE, {
        method: 'POST',
        body: JSON.stringify(built.item)
      });
      if (response.code !== 0) return apiErrorResult('Failed to create proxy', response);
      return createdProxyResult(payloadRows(response.data).map(safeProxy));
    }
  }),
  defineTool({
    name: 'nex_proxy_batch_create',
    description:
      'Create multiple custom proxy resources from an items array. Each item needs host and port. Credentials are never returned.',
    inputSchema: batchCreateProxyInputSchema,
    execute: async (args, ctx) => {
      const items = writeItems(args, ['items', 'proxies', 'proxyList']);
      if (!items.length) return errorResult('Failed to create proxies: items is required');
      const normalized = [];
      for (const raw of items) {
        const built = proxyWriteFields(raw as Record<string, any>, { defaultProtocol: 'SOCKS5' });
        if (built.error || !built.item) {
          return errorResult(`Failed to create proxies: ${built.error || 'invalid item'}`);
        }
        normalized.push(built.item);
      }
      const response = await ctx.api.request<any>(PROXY_BATCH_CREATE_ROUTE, {
        method: 'POST',
        body: JSON.stringify({ items: normalized })
      });
      if (response.code !== 0) return apiErrorResult('Failed to create proxies', response);
      return createdProxyResult(payloadRows(response.data).map(safeProxy));
    }
  }),
  defineTool({
    name: 'nex_proxy_modify',
    description:
      'Update one existing custom proxy resource. Pass only the fields that must change. Credentials are never returned.',
    inputSchema: modifyProxyInputSchema,
    execute: async (args, ctx) => {
      const proxyId = firstScalar(args, ['proxyId', 'id']);
      if (proxyId === undefined) {
        return errorResult('Failed to modify proxy: proxyId is required');
      }
      const protocol = normalizeProxyProtocol(args.protocol);
      if (protocol && !SUPPORTED_PROXY_PROTOCOLS.has(protocol)) {
        return errorResult('Failed to modify proxy: protocol must be SOCKS5, HTTP, or HTTPS');
      }
      const response = await ctx.api.request<any>(PROXY_MODIFY_ROUTE, {
        method: 'POST',
        body: JSON.stringify({
          id: proxyId,
          proxyId,
          ...(protocol ? { protocol } : {}),
          ...(args.host === undefined ? {} : { host: String(args.host).trim() }),
          ...(args.port === undefined ? {} : { port: args.port }),
          ...(args.ipVersion === undefined ? {} : { ipVersion: String(args.ipVersion).trim() }),
          ...(typeof args.username === 'string' ? { username: args.username } : {}),
          ...(typeof args.password === 'string' ? { password: args.password } : {}),
          ...(args.remark === undefined ? {} : { remark: args.remark })
        })
      });
      if (response.code !== 0) return apiErrorResult('Failed to modify proxy', response);
      const rows = payloadRows(response.data).map(safeProxy);
      return successResult(`Updated proxy resource ${proxyId}.`, {
        rows,
        proxyId
      });
    }
  }),
  defineTool({
    name: 'nex_proxy_delete',
    description:
      'Delete one or more custom proxy resources. Bought channel proxies may be rejected by Desktop. Credentials are never returned.',
    annotations: { destructiveHint: true },
    inputSchema: deleteProxyInputSchema,
    execute: async (args, ctx) => {
      const ids = firstIds(args, ['items', 'proxyId', 'proxyIds', 'id']);
      if (!ids.length) return errorResult('Failed to delete proxy: proxyId is required');
      const response = await ctx.api.request<unknown>(PROXY_DELETE_ROUTE, {
        method: 'POST',
        body: JSON.stringify({ items: ids })
      });
      if (response.code !== 0) return apiErrorResult('Failed to delete proxy', response);
      return successResult(
        `Deleted ${ids.length} proxy resource(s).`,
        ids.length === 1 ? { proxyId: ids[0] } : { proxyIds: ids }
      );
    }
  }),
  defineTool({
    name: 'nex_proxy_detect',
    description:
      'Probe a proxy resource or an unsaved host:port for exit IP, location, and timezone. Credentials are never returned.',
    inputSchema: detectProxyInputSchema,
    execute: async (args, ctx) => {
      const host = args.host === undefined ? '' : String(args.host).trim();
      const port = args.port === undefined || args.port === '' ? '' : String(args.port).trim();
      const protocol = normalizeProxyProtocol(args.protocol);
      const proxyId = firstScalar(args, ['proxyId', 'id']);
      if (proxyId === undefined && (!host || !port)) {
        return errorResult('Failed to detect proxy: proxyId or host and port are required');
      }
      if (protocol && !SUPPORTED_PROXY_PROTOCOLS.has(protocol)) {
        return errorResult('Failed to detect proxy: protocol must be SOCKS5, HTTP, or HTTPS');
      }
      const response = await ctx.api.request<any>(PROXY_DETECT_ROUTE, {
        method: 'POST',
        body: JSON.stringify({
          ...(proxyId === undefined ? {} : { id: proxyId, proxyId }),
          ...(protocol ? { protocol } : {}),
          ...(host ? { host } : {}),
          ...(port ? { port } : {}),
          ...(typeof args.username === 'string' ? { username: args.username } : {}),
          ...(typeof args.password === 'string' ? { password: args.password } : {})
        })
      });
      if (response.code !== 0) return apiErrorResult('Failed to detect proxy', response);
      const raw = response.data;
      const rows = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(safeDetectResult);
      const first = rows[0];
      return successResult(
        first
          ? [
              `Proxy detect ${first.status || 'completed'}.`,
              `  - Exit: ${first.activeIp || first.ip || first.query || 'Unknown'}`,
              `  - Location: ${[first.country, first.city].filter(Boolean).join(' / ') || 'Unknown'}`,
              `  - Timezone: ${first.timezone || 'Unknown'}`
            ].join('\n')
          : 'Proxy detect completed.',
        { rows }
      );
    }
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
      const ids = firstIds(args, ['windowId', 'windowIds', 'ids']);
      if (!ids.length) return errorResult('Failed to bind proxy: windowId is required');
      const response = await ctx.api.request<any>(BROWSER_PROXY_ROUTE, {
        method: 'POST',
        body: JSON.stringify({ windowIds: ids, proxyId: args.proxyId })
      });
      if (response.code !== 0) return apiErrorResult('Failed to bind proxy', response);
      const data = response.data || {};
      const rows = Array.isArray(data.rows) ? data.rows : [];
      return successResult(
        [
          Number(args.proxyId) === 0
            ? 'Proxy binding removed.'
            : `Proxy ${args.proxyId} binding requested.`,
          ...batchOutcomeLines(data, rows)
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
    name: 'nex_browser_bind_account',
    description:
      'Bind one or more workspace catalog platform accounts to one or more closed NexBrowser windows. This replaces the existing window binding. Pass accountIds=[] to remove it. Running windows are rejected and must be closed first. After opening, use nex_browser_accounts to fill.',
    annotations: { destructiveHint: true },
    inputSchema: bindAccountInputSchema,
    execute: async (args, ctx) => {
      const ids = firstIds(args, ['windowId', 'windowIds', 'ids']);
      if (!ids.length) return errorResult('Failed to bind platform account: windowId is required');
      if (!hasAlias(args, ['accountIds'])) {
        return errorResult('Failed to bind platform account: accountIds is required');
      }
      const accountIds = firstIds(args, ['accountIds']);
      const response = await ctx.api.request<any>(BROWSER_ACCOUNT_ROUTE, {
        method: 'POST',
        body: JSON.stringify({
          windowIds: ids,
          accountIds
        })
      });
      if (response.code !== 0) return apiErrorResult('Failed to bind platform account', response);
      const unbound = !accountIds.length || accountIds.every((id) => Number(id) === 0);
      const boundIds = unbound ? [] : accountIds.filter((id) => Number(id) !== 0);
      return successResult(
        unbound
          ? 'Platform account binding removed.'
          : `Bound ${boundIds.length} platform account(s).`,
        { accountIds: boundIds }
      );
    }
  }),
  defineTool({
    name: 'nex_browser_group_list',
    description:
      'List the window groups of the active NexBrowser workspace with the window count of each, so a groupId can be selected for window creation, moving, or deletion. The first row is always the ungrouped bucket with groupId 0.',
    annotations: { readOnlyHint: true },
    inputSchema: z.object({}).passthrough(),
    execute: async (_args, ctx) => {
      const response = await ctx.api.request<any>(GROUP_LIST_ROUTE, { method: 'GET' });
      if (response.code !== 0) return apiErrorResult('Failed to list window groups', response);
      const rows = Array.isArray(response.data) ? response.data : [];
      return successResult(
        rows.length
          ? [`Found ${rows.length} window group(s):`, '', rows.map(groupSummary).join('\n\n')].join(
              '\n'
            )
          : 'No window groups found.',
        { rows }
      );
    }
  }),
  defineTool({
    name: 'nex_browser_group_create',
    description:
      'Create one window group in the active NexBrowser workspace. Group names must be unique inside the team; a duplicate name is rejected. Use nex_browser_group_modify to rename it, or nex_browser_move_to_group to put windows into the new group.',
    inputSchema: createGroupInputSchema,
    execute: async (args, ctx) => {
      const name = args.name.trim();
      if (!name) return errorResult('Failed to create window group: name is required');
      const response = await ctx.api.request<any>(GROUP_CREATE_ROUTE, {
        method: 'POST',
        body: JSON.stringify({ name, ...(args.seq === undefined ? {} : { seq: args.seq }) })
      });
      if (response.code !== 0) return apiErrorResult('Failed to create window group', response);
      const rows = Array.isArray(response.data) ? response.data : [];
      const created = rows[0];
      return successResult(
        created
          ? [`Created window group **${created.name || name}** with groupId ${created.id}.`].join(
              '\n'
            )
          : `Created window group **${name}**.`,
        { rows }
      );
    }
  }),
  defineTool({
    name: 'nex_browser_group_modify',
    description:
      'Rename or reorder one custom window group in the active NexBrowser workspace. Group names must stay unique inside the team. The ungrouped bucket (groupId 0) cannot be changed.',
    inputSchema: modifyGroupInputSchema,
    execute: async (args, ctx) => {
      const groupId = firstScalar(args, ['groupId', 'id']);
      if (groupId === undefined) {
        return errorResult('Failed to modify window group: groupId is required');
      }
      if (Number(groupId) === 0) {
        return errorResult('Failed to modify window group: the ungrouped bucket cannot be changed');
      }
      const name = args.name === undefined ? undefined : args.name.trim();
      if (name === undefined && args.seq === undefined) {
        return errorResult('Failed to modify window group: name or seq is required');
      }
      if (name !== undefined && !name) {
        return errorResult('Failed to modify window group: name cannot be empty');
      }
      const response = await ctx.api.request<any>(GROUP_MODIFY_ROUTE, {
        method: 'POST',
        body: JSON.stringify({
          id: groupId,
          ...(name === undefined ? {} : { name }),
          ...(args.seq === undefined ? {} : { seq: args.seq })
        })
      });
      if (response.code !== 0) return apiErrorResult('Failed to modify window group', response);
      const rows = payloadRows(response.data);
      return successResult(`Updated window group ${groupId}.`, {
        rows,
        groupId
      });
    }
  }),
  defineTool({
    name: 'nex_browser_group_delete',
    description:
      'Delete one custom window group from the active NexBrowser workspace. The windows inside it are not deleted; they become ungrouped. The ungrouped bucket (groupId 0) cannot be deleted.',
    annotations: { destructiveHint: true },
    inputSchema: deleteGroupInputSchema,
    execute: async (args, ctx) => {
      const groupId = firstScalar(args, ['groupId', 'id']);
      if (groupId === undefined) {
        return errorResult('Failed to delete window group: groupId is required');
      }
      if (Number(groupId) === 0) {
        return errorResult('Failed to delete window group: the ungrouped bucket cannot be deleted');
      }
      const response = await ctx.api.request<unknown>(GROUP_DELETE_ROUTE, {
        method: 'POST',
        body: JSON.stringify({ id: groupId })
      });
      if (response.code !== 0) return apiErrorResult('Failed to delete window group', response);
      return successResult(
        `Deleted window group ${groupId}. Its windows were moved to the ungrouped bucket.`,
        { groupId }
      );
    }
  }),
  defineTool({
    name: 'nex_browser_move_to_group',
    description:
      'Move one or more NexBrowser windows into a window group. Pass groupId=0 to move them out of any group. Groups are window metadata, so running windows can be moved without closing them first.',
    inputSchema: moveToGroupInputSchema,
    execute: async (args, ctx) => {
      const ids = firstIds(args, ['windowId', 'windowIds', 'ids']);
      if (!ids.length) return errorResult('Failed to move windows: windowId is required');
      const response = await ctx.api.request<any>(BROWSER_GROUP_ROUTE, {
        method: 'POST',
        body: JSON.stringify({ windowIds: ids, groupId: args.groupId })
      });
      if (response.code !== 0) return apiErrorResult('Failed to move windows', response);
      const data = response.data || {};
      const rows = Array.isArray(data.rows) ? data.rows : [];
      return successResult(
        [
          Number(args.groupId) === 0
            ? 'Windows moved out of any group.'
            : `Move to group ${args.groupId} requested.`,
          ...batchOutcomeLines(data, rows)
        ].join('\n'),
        {
          rows,
          groupId: args.groupId,
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
        windowId: browserIdsSchema
          .describe(
            'One window ID, or all target window IDs in one array for a single batch-start request.'
          )
          .optional(),
        ids: browserIdsSchema.describe('Documented alias of windowId').optional()
      })
      .passthrough(),
    execute: async (args, ctx) => {
      const ids = firstIds(args, ['windowId', 'ids', 'id']);
      if (!args.teamId || !ids.length) {
        return errorResult('Failed to open browsers: teamId and windowId are required');
      }
      const response = await ctx.api.request<any>(BROWSER_OPEN_ROUTE, {
        method: 'POST',
        body: JSON.stringify({ teamId: args.teamId, ids })
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
    description:
      'Inspect the status of running NexBrowser environments. Omit windowId to list every running window.',
    annotations: { readOnlyHint: true },
    inputSchema: z
      .object({
        teamId: browserIdSchema.describe('Optional team filter; OpenAPI uses the active team').optional(),
        windowId: browserIdsSchema
          .describe('One window ID or a list; omit to list every running window')
          .optional(),
        ids: browserIdsSchema.describe('Alias of windowId').optional()
      })
      .passthrough(),
    execute: async (args, ctx) => {
      const ids = firstIds(args, ['windowId', 'windowIds', 'ids']);
      const query = new URLSearchParams();
      if (args.teamId !== undefined && args.teamId !== '') query.set('teamId', String(args.teamId));
      if (ids.length) query.set('windowId', ids.join(','));
      const path = query.toString()
        ? `${BROWSER_CONNECTION_INFO_ROUTE}?${query}`
        : BROWSER_CONNECTION_INFO_ROUTE;
      const response = await ctx.api.request<any[]>(path, {
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
      .object({
        teamId: browserIdSchema.optional(),
        windowId: browserIdsSchema.describe('One window ID or a list; alias of ids').optional(),
        ids: browserIdsSchema.describe('Documented alias of windowId').optional()
      })
      .passthrough(),
    execute: async (args, ctx) => {
      const ids = firstIds(args, ['windowId', 'ids', 'id']);
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
      'List autofill-capable credentials in the vault plugin of open NexBrowser environments, including bound platform accounts and user-saved passwords. Usernames are masked and secrets are never returned; call nex_browser_fill_account with an accountId from this result.',
    annotations: { readOnlyHint: true },
    inputSchema: z
      .object({
        windowId: browserIdsSchema.describe('One window ID or a list').optional(),
        windowIds: browserIdsSchema.describe('Alias of windowId').optional()
      })
      .passthrough(),
    execute: async (args, ctx) => {
      const ids = firstIds(args, ['windowId', 'windowIds', 'ids']);
      if (!ids.length) return errorResult('Failed to get vault credentials: windowId is required');
      const query = new URLSearchParams({ windowId: ids.join(',') });
      const response = await ctx.api.request<any[]>(`${BROWSER_ACCOUNTS_ROUTE}?${query}`, {
        method: 'GET'
      });
      if (response.code !== 0) return apiErrorResult('Failed to get vault credentials', response);
      const rows = Array.isArray(response.data) ? response.data : [];
      return successResult(
        rows
          .map((row) =>
            [
              `**${row?.windowName || 'Unnamed'}** (${row?.windowId ?? 'Unknown'})`,
              ...(row?.accounts?.length
                ? row.accounts.map(accountSummary)
                : ['  - No autofill-capable credential is available in this window vault.'])
            ].join('\n')
          )
          .join('\n\n') || 'No windows matched.',
        { rows }
      );
    }
  }),
  defineTool({
    name: 'nex_account_list',
    description:
      'List platform accounts in the workspace catalog so an accountId can be selected for window creation or later vault fill. This is not the open-window vault; use nex_browser_accounts after a window is running. Secrets are never returned.',
    annotations: { readOnlyHint: true },
    inputSchema: listAccountsInputSchema,
    execute: async (args, ctx) => {
      const query = new URLSearchParams({
        page: String(args.page ?? 1),
        size: String(args.size ?? 100)
      });
      if (args.teamId !== undefined) query.set('teamId', String(args.teamId));
      if (args.keyword) query.set('keyword', args.keyword);
      const response = await ctx.api.request<any>(`${ACCOUNT_LIST_ROUTE}?${query}`, {
        method: 'GET'
      });
      if (response.code !== 0) return apiErrorResult('Failed to list platform accounts', response);
      const payload = response.data || {};
      const rows = payloadRows(payload).map(safeAccount);
      const total = Number(payload?.count ?? payload?.total ?? rows.length);
      return successResult(
        rows.length
          ? [`Found ${total} platform account(s):`, '', rows.map(accountCatalogSummary).join('\n\n')].join(
              '\n'
            )
          : 'No platform accounts found.',
        { rows, total, page: args.page ?? 1, size: args.size ?? 100 }
      );
    }
  }),
  defineTool({
    name: 'nex_account_create',
    description:
      'Create one platform account in the workspace catalog, or pass items to create several. Pass platformUrl; username, password, and 2FA secret are optional and write-only. This does not fill a login form.',
    inputSchema: createAccountInputSchema.extend({
      items: z
        .array(accountItemInputSchema)
        .describe('Create several accounts in one call; each item needs platformUrl')
        .optional()
    }),
    execute: async (args, ctx) => {
      const items = writeItems(args, ['items', 'accounts', 'accountList']);
      if (items.length) {
        const normalized = [];
        for (const raw of items) {
          const item = accountWriteFields(raw as Record<string, any>);
          if (!String(item.platformUrl || '').trim()) {
            return errorResult('Failed to create platform account: each item needs platformUrl');
          }
          normalized.push(item);
        }
        const response = await ctx.api.request<any>(ACCOUNT_BATCH_CREATE_ROUTE, {
          method: 'POST',
          body: JSON.stringify({ items: normalized })
        });
        if (response.code !== 0) return apiErrorResult('Failed to create platform account', response);
        return createdAccountResult(payloadRows(response.data).map(safeAccount));
      }
      const platformUrl = String(args.platformUrl || '').trim();
      if (!platformUrl) {
        return errorResult('Failed to create platform account: platformUrl is required');
      }
      const username = args.username === undefined ? undefined : String(args.username).trim();
      const response = await ctx.api.request<any>(ACCOUNT_CREATE_ROUTE, {
        method: 'POST',
        body: JSON.stringify(accountWriteFields({ ...args, platformUrl, username }))
      });
      if (response.code !== 0) return apiErrorResult('Failed to create platform account', response);
      return createdAccountResult(payloadRows(response.data).map(safeAccount));
    }
  }),
  defineTool({
    name: 'nex_account_batch_create',
    description:
      'Create multiple platform accounts from an items array. Each item needs platformUrl. Secrets are write-only and never returned.',
    inputSchema: batchCreateAccountInputSchema,
    execute: async (args, ctx) => {
      const items = writeItems(args, ['items', 'accounts', 'accountList']);
      if (!items.length) return errorResult('Failed to create platform accounts: items is required');
      const normalized = [];
      for (const raw of items) {
        const item = accountWriteFields(raw as Record<string, any>);
        if (!String(item.platformUrl || '').trim()) {
          return errorResult('Failed to create platform accounts: each item needs platformUrl');
        }
        normalized.push(item);
      }
      const response = await ctx.api.request<any>(ACCOUNT_BATCH_CREATE_ROUTE, {
        method: 'POST',
        body: JSON.stringify({ items: normalized })
      });
      if (response.code !== 0) return apiErrorResult('Failed to create platform accounts', response);
      return createdAccountResult(payloadRows(response.data).map(safeAccount));
    }
  }),
  defineTool({
    name: 'nex_account_modify',
    description:
      'Update one platform account in the workspace catalog. Pass only the fields that must change. Password and 2FA secret are write-only and never returned.',
    inputSchema: modifyAccountInputSchema,
    execute: async (args, ctx) => {
      const accountId = firstScalar(args, ['accountId', 'id']);
      if (accountId === undefined) {
        return errorResult('Failed to modify platform account: accountId is required');
      }
      const response = await ctx.api.request<any>(ACCOUNT_MODIFY_ROUTE, {
        method: 'POST',
        body: JSON.stringify(accountWriteFields({ ...args, accountId }))
      });
      if (response.code !== 0) return apiErrorResult('Failed to modify platform account', response);
      const rows = payloadRows(response.data).map(safeAccount);
      return successResult(`Updated platform account ${accountId}.`, {
        rows,
        accountId
      });
    }
  }),
  defineTool({
    name: 'nex_account_delete',
    description:
      'Delete one or more platform accounts from the workspace catalog. This does not close windows or remove vault copies already stored in an open window.',
    annotations: { destructiveHint: true },
    inputSchema: deleteAccountInputSchema,
    execute: async (args, ctx) => {
      const ids = firstIds(args, ['items', 'accountId', 'accountIds', 'id']);
      if (!ids.length) return errorResult('Failed to delete platform account: accountId is required');
      const response = await ctx.api.request<unknown>(ACCOUNT_DELETE_ROUTE, {
        method: 'POST',
        body: JSON.stringify({ items: ids })
      });
      if (response.code !== 0) return apiErrorResult('Failed to delete platform account', response);
      return successResult(
        `Deleted ${ids.length} platform account(s).`,
        ids.length === 1 ? { accountId: ids[0] } : { accountIds: ids }
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
