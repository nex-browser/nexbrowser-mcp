import type { ToolContext } from '../../shared/define-tool.js';
import { apiErrorResult, successResult } from '../../shared/tool-result.js';
import {
  InvalidArgumentError,
  type ActiveSessionStore,
  type McpContent,
  type McpToolResult,
  type NexApiRequester,
  type NexApiResponse
} from '../../shared/types.js';
import { actionsRoute } from '../../transport/routes.js';

export const MAX_MCP_IMAGE_BYTES = 10 * 1024 * 1024;

function base64ByteLength(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
}

/**
 * Coerces an ID-like value (string or number) to trimmed text, throwing a typed error when empty.
 * 将 ID 类值（字符串或数字）强制转换为去空白文本，为空时抛出类型化错误。
 */
export function requiredText(value: unknown, field: string): string {
  const text = value === undefined || value === null ? '' : String(value).trim();
  if (!text) throw new InvalidArgumentError(`${field} is required`);
  return text;
}

/**
 * Resolves the target session: an explicit sessionId argument wins over the implicit active session, and missing both is a typed error.
 * 解析目标会话：显式 sessionId 参数优先于隐式活动会话，两者皆缺则抛出类型化错误。
 */
export function sessionId(args: Record<string, any>, sessions?: ActiveSessionStore): string {
  return requiredText(args.sessionId ?? sessions?.getActiveSessionId(), 'sessionId');
}

/**
 * Formats an action response: base64 artifacts become image content, and a snapshot suppresses the raw result text.
 * 格式化动作响应：base64 产物转换为图片内容；存在快照时不再输出原始 result 文本。
 */
function automationSuccess(label: string, data: any): McpToolResult {
  const content: McpContent[] = [];
  let omittedArtifacts = 0;
  for (const artifact of Array.isArray(data?.artifacts) ? data.artifacts : []) {
    if (artifact?.base64 && artifact?.mimeType) {
      if (base64ByteLength(artifact.base64) <= MAX_MCP_IMAGE_BYTES) {
        content.push({ type: 'image', data: artifact.base64, mimeType: artifact.mimeType });
      } else {
        omittedArtifacts++;
      }
    }
  }
  const details = [
    label,
    data?.snapshot ? `\n${data.snapshot}` : '',
    data?.result !== undefined && !data?.snapshot
      ? `\n${typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2)}`
      : '',
    omittedArtifacts
      ? `\n${omittedArtifacts} artifact(s) omitted because each exceeded ${MAX_MCP_IMAGE_BYTES} bytes.`
      : ''
  ].join('');
  const structuredData = data && typeof data === 'object' ? { ...data } : data;
  if (structuredData && typeof structuredData === 'object') {
    delete structuredData.snapshot;
    if (Array.isArray(structuredData.artifacts)) {
      structuredData.artifacts = structuredData.artifacts.map((artifact: any) => ({
        mimeType: artifact?.mimeType,
        size: typeof artifact?.base64 === 'string' ? base64ByteLength(artifact.base64) : undefined
      }));
    }
  }
  return successResult(details, { data: structuredData ?? null }, content);
}

/**
 * Posts one automation action for the resolved session, hoisting pageId beside the action rather than into params; non-zero codes become structured MCP errors.
 * 向解析出的会话提交单个自动化动作，pageId 提升到与 action 同级而非放入 params；非零 code 转换为结构化 MCP 错误。
 */
export async function callAction(
  ctx: ToolContext,
  args: Record<string, any>,
  action: string,
  params: Record<string, unknown>,
  label: string
): Promise<McpToolResult> {
  const response = await ctx.api.request<any>(actionsRoute(sessionId(args, ctx.sessions)), {
    method: 'POST',
    body: JSON.stringify({
      action,
      ...(args.pageId ? { pageId: String(args.pageId) } : {}),
      params
    })
  });
  return response.code === 0
    ? automationSuccess(label, response.data)
    : apiErrorResult(label, response);
}

/**
 * Calls a session or tab endpoint; onSuccess fires only on code 0, before the JSON payload is formatted.
 * 调用会话或标签页端点；onSuccess 仅在 code 为 0 时、格式化 JSON 载荷之前触发。
 */
export async function callEndpoint(
  api: NexApiRequester,
  path: string,
  options: RequestInit,
  label: string,
  onSuccess?: (data: any) => void
): Promise<McpToolResult> {
  const response: NexApiResponse<any> = await api.request(path, options);
  if (response.code !== 0) return apiErrorResult(label, response);
  const data = response.data;
  onSuccess?.(data);
  return successResult(
    `${label}\n${data === undefined ? '' : JSON.stringify(data, null, 2)}`.trim(),
    { data: data ?? null }
  );
}
