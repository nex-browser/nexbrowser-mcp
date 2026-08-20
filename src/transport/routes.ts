/**
 * Single source of every Nex OpenAPI path used by this package. Tools must
 * build URLs through these helpers; inline path strings are forbidden.
 * 本包使用的全部 Nex OpenAPI 路径唯一出处；工具必须经由这些助手构造 URL，
 * 禁止内联路径字符串。
 */

// Automation session endpoints. 自动化会话端点。

/** Session collection root; DELETE here releases every session owned by the calling client. 会话集合根路径；对其 DELETE 会释放调用方客户端持有的全部会话。 */
export const SESSIONS_ROOT = '/automation/sessions';

/** Single-session resource path; the session ID is URL-encoded here so callers never have to. 单个会话资源路径；session ID 在此统一 URL 编码，调用方无需处理。 */
export const sessionRoute = (sessionId: string): string =>
  `${SESSIONS_ROOT}/${encodeURIComponent(sessionId)}`;

/** Action execution endpoint of one session. 单个会话的动作执行端点。 */
export const actionsRoute = (sessionId: string): string => `${sessionRoute(sessionId)}/actions`;

/** Tab collection endpoint of one session. 单个会话的标签页集合端点。 */
export const tabsRoute = (sessionId: string): string => `${sessionRoute(sessionId)}/tabs`;

/** Tab operation endpoint; the union type keeps the operation set closed to select/close. 标签页操作端点；联合类型将操作集合限定为 select/close。 */
export const tabOperationRoute = (sessionId: string, operation: 'select' | 'close'): string =>
  `${tabsRoute(sessionId)}/${operation}`;

/**
 * Credential-fill endpoint of one session; the vault plugin resolves and fills
 * the stored credential so no secret ever crosses this transport.
 * 单个会话的凭据填充端点；保险库插件解析并填充凭据，密钥不经过本传输层。
 */
export const accountFillRoute = (sessionId: string): string =>
  `${sessionRoute(sessionId)}/account_fill`;

// Environment management endpoints. 环境管理端点。

/** Paginated window/environment listing; parameters go in the query string. 分页的窗口/环境列表；参数经 query string 传递。 */
export const BROWSER_LIST_ROUTE = '/browser/list';
/** Creates windows from the Desktop app's own create-window defaults. 按 Desktop 客户端「创建窗口」的默认值建窗。 */
export const BROWSER_CREATE_ROUTE = '/browser/create';
/** Binds one proxy resource to closed windows; proxyId=0 removes it. 为已关闭窗口绑定代理；proxyId=0 解绑。 */
export const BROWSER_PROXY_ROUTE = '/browser/proxy';
/** Moves windows into one window group; groupId=0 moves them out of any group. 把窗口移动到指定分组；groupId=0 移出分组。 */
export const BROWSER_GROUP_ROUTE = '/browser/group';
/** Platform accounts bound to a window; secrets are never returned. 窗口绑定的平台账号；不返回任何密钥。 */
export const BROWSER_ACCOUNTS_ROUTE = '/browser/accounts';
/** Binds catalog platform accounts to closed windows; accountIds=[] removes the binding. 给已关闭窗口绑定目录账号；accountIds=[] 解绑。 */
export const BROWSER_ACCOUNT_ROUTE = '/browser/account';
/** Starts browser windows by teamId + windowId. 按 teamId + windowId 启动浏览器窗口。 */
export const BROWSER_OPEN_ROUTE = '/browser/open';
/** Closes running browser windows. 关闭正在运行的浏览器窗口。 */
export const BROWSER_CLOSE_ROUTE = '/browser/close';
/** CDP/debug connection info for running windows; parameters go in the query string. 运行中窗口的 CDP/调试连接信息；参数经 query string 传递。 */
export const BROWSER_CONNECTION_INFO_ROUTE = '/browser/connection_info';
/** Paginated proxy resources safe for selection by ID. 可按 ID 选择的代理资源分页。 */
export const PROXY_LIST_ROUTE = '/proxy/list';
/** Imports custom proxies from Desktop-compatible text lines. 按桌面端相同行格式导入自定义代理。 */
export const PROXY_IMPORT_ROUTE = '/proxy/import';
/** Creates one custom proxy resource. 新建一条自定义代理。 */
export const PROXY_CREATE_ROUTE = '/proxy/create';
/** Creates multiple custom proxy resources from an items array. 按 items 批量新建自定义代理。 */
export const PROXY_BATCH_CREATE_ROUTE = '/proxy/batch_create';
/** Updates one existing custom proxy resource. 修改一条已有自定义代理。 */
export const PROXY_MODIFY_ROUTE = '/proxy/modify';
/** Deletes one or more custom proxy resources. 删除一条或多条自定义代理。 */
export const PROXY_DELETE_ROUTE = '/proxy/delete';
/** Probes a proxy's exit IP and location. 检测代理出口 IP 与归属地。 */
export const PROXY_DETECT_ROUTE = '/proxy/detect';
/** Window groups of the active team, including the synthetic ungrouped bucket. 当前团队的窗口分组，含服务端合成的「未分组」。 */
export const GROUP_LIST_ROUTE = '/group/list';
/** Creates one window group in the active team. 在当前团队下新建一个窗口分组。 */
export const GROUP_CREATE_ROUTE = '/group/create';
/** Renames or reorders one custom window group. 重命名或调整一个自建窗口分组。 */
export const GROUP_MODIFY_ROUTE = '/group/modify';
/** Deletes one custom window group; its windows become ungrouped. 删除一个自建窗口分组，组内窗口转为未分组。 */
export const GROUP_DELETE_ROUTE = '/group/delete';
/** Paginated platform-account catalog; secrets must be stripped before they leave MCP. 平台账号目录分页；离开 MCP 前必须去掉密钥。 */
export const ACCOUNT_LIST_ROUTE = '/account/list';
/** Creates one platform account in the workspace catalog. 在工作区目录中新建一条平台账号。 */
export const ACCOUNT_CREATE_ROUTE = '/account/create';
/** Creates multiple platform accounts from an items array. 按 items 批量新建平台账号。 */
export const ACCOUNT_BATCH_CREATE_ROUTE = '/account/batch_create';
/** Updates one platform account in the workspace catalog. 修改工作区目录中的一条平台账号。 */
export const ACCOUNT_MODIFY_ROUTE = '/account/modify';
/** Deletes one or more platform accounts from the workspace catalog. 从工作区目录删除一条或多条平台账号。 */
export const ACCOUNT_DELETE_ROUTE = '/account/delete';
