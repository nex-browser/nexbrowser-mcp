/**
 * Single source of every Nex OpenAPI path used by this package. Tools must
 * build URLs through these helpers; inline path strings are forbidden.
 * 本包使用的全部 Nex OpenAPI 路径唯一出处；工具必须经由这些助手构造 URL，
 * 禁止内联路径字符串。
 */

// Automation session endpoints. 自动化会话端点。

/** Session collection root; DELETE here releases every session owned by the calling client. 会话集合根路径；对其 DELETE 会释放调用方客户端持有的全部会话。 */
export const SESSIONS_ROOT = '/ai/browser/sessions';

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

// Environment management endpoints. 环境管理端点。

/** Paginated window/environment listing. 分页的窗口/环境列表。 */
export const SCREEN_LOAD_ROUTE = '/screen_load';
/** Starts browser windows by teamId + windowId. 按 teamId + windowId 启动浏览器窗口。 */
export const BROWSER_OPEN_ROUTE = '/browser/open';
/** Closes running browser windows. 关闭正在运行的浏览器窗口。 */
export const BROWSER_CLOSE_ROUTE = '/browser/close';
/** CDP/debug connection info for running windows; parameters go in the query string. 运行中窗口的 CDP/调试连接信息；参数经 query string 传递。 */
export const BROWSER_CONNECTION_INFO_ROUTE = '/browser/connection_info';
