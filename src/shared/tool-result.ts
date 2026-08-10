import type { McpContent, McpToolResult, NexApiResponse } from './types.js';

export const MAX_MCP_TEXT_CHARS = 1_000_000;
export const MAX_MCP_STRUCTURED_BYTES = 2 * 1024 * 1024;

function boundedText(text: string): string {
  return text.length <= MAX_MCP_TEXT_CHARS
    ? text
    : `${text.slice(0, MAX_MCP_TEXT_CHARS)}\n[Output truncated at ${MAX_MCP_TEXT_CHARS} characters]`;
}

function boundedStructuredContent(
  value: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') <= MAX_MCP_STRUCTURED_BYTES) return value;
  } catch {
    return { omitted: true, reason: 'Structured content is not JSON serializable.' };
  }
  return { omitted: true, reason: `Structured content exceeds ${MAX_MCP_STRUCTURED_BYTES} bytes.` };
}

/**
 * Wraps text, rich content, and structured data as a successful MCP result.
 * 将文本、富内容和结构化数据包装为成功的 MCP 结果。
 */
export function successResult(
  text: string,
  structuredContent?: Record<string, unknown>,
  extraContent: McpContent[] = []
): McpToolResult {
  const bounded = boundedStructuredContent(structuredContent);
  return {
    content: [{ type: 'text', text: boundedText(text) }, ...extraContent],
    ...(bounded ? { structuredContent: bounded } : {})
  };
}

/**
 * Marks failures with the MCP protocol flag so clients do not treat error text as success.
 * 使用 MCP 协议失败标记，避免客户端将错误文本视为成功。
 */
export function errorResult(
  message: string,
  structuredContent?: Record<string, unknown>
): McpToolResult {
  const bounded = boundedStructuredContent(structuredContent);
  return {
    content: [{ type: 'text', text: boundedText(message) }],
    ...(bounded ? { structuredContent: bounded } : {}),
    isError: true
  };
}

/**
 * Actionable next-step hints keyed by the server's stable AutomationErrorCode
 * strings, so an unattended agent can self-recover instead of stalling.
 * 按服务端稳定 AutomationErrorCode 字符串码给出的可执行下一步提示，
 * 让无人值守的 agent 能自行恢复而不是卡住。
 */
const NEX_ERROR_HINTS: Record<string, string> = {
  UNAUTHORIZED: 'API key rejected — check NEX_API_KEY (or --api-key) and retry.',
  TEAM_REQUIRED: 'A team is required — pass teamId or select a team in NexBrowser first.',
  WINDOW_NOT_FOUND: 'Window not found — call nex_list_browsers to confirm the windowId.',
  WINDOW_NOT_RUNNING:
    'Window is not running — retry nex_browser_connect with startIfNeeded=true, or call nex_open_browsers first.',
  SESSION_NOT_FOUND:
    'Session expired or unknown — call nex_browser_connect to create a new session, then retry.',
  PAGE_NOT_FOUND: 'Page is gone or pageId is stale — call browser_tab_list for current page IDs.',
  ACTION_NOT_ALLOWED:
    'This action is blocked by permission policy (for example the evaluate/runCode permission is disabled).',
  ACTION_TIMEOUT:
    'Action timed out — wait with browser_wait_for until the page settles, then retry.',
  PLAYWRIGHT_CONNECTION_LOST:
    'Browser connection lost — call nex_browser_connect to reconnect, then retry.',
  FILE_ACCESS_DENIED: 'File path not allowed — use files inside the approved directories.'
};

/**
 * Converts a non-zero Nex response into a stable MCP error result, appending a
 * recovery hint when the error code has a known next step.
 * 将非零 Nex 响应转换为稳定的 MCP 错误结果；已知错误码时附加恢复提示。
 */
export function apiErrorResult(prefix: string, response: NexApiResponse): McpToolResult {
  const message = response.msg || 'Unknown error';
  // Normalize numeric and AutomationErrorCode-string failures for the hint lookup.
  // 将数值失败码与 AutomationErrorCode 字符串统一后查找提示。
  const hint = NEX_ERROR_HINTS[String(response.code)];
  return errorResult(`${prefix}: ${message}${hint ? `\n${hint}` : ''}`, {
    code: response.code,
    message,
    ...(hint ? { hint } : {})
  });
}

/**
 * Returns an MCP error for locally detectable missing arguments.
 * 为本地可检测的缺失参数返回 MCP 错误。
 */
export function invalidArguments(message: string): McpToolResult {
  return errorResult(message, { code: 'INVALID_ARGUMENT', message });
}
