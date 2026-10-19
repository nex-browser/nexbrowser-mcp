import { z } from 'zod';
import { defineTool, type McpToolSpec } from './define-tool.js';
import { apiErrorResult, errorResult, successResult } from './tool-result.js';
import { NexConfigurationError } from './types.js';

export const serviceId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const servicePager = z
  .object({
    page: serviceId.default(1),
    size: serviceId.max(1000).default(20),
    keyword: z.string().optional()
  })
  .strict();
export const maxTotalPrice = z
  .union([z.number().nonnegative().finite(), z.string().regex(/^\d+(?:\.\d+)?$/)])
  .describe(
    'Maximum total USDT explicitly approved by the user. Live preflight only; the backend does not support an atomic price ceiling.'
  );

/** 解析持久化 JSON 字符串，空值和无效历史值保留为给定默认值。 */
export function parseServiceJson(value: unknown, fallback: unknown = null): any {
  if (typeof value !== 'string') return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** 按真实分页字段区分总记录数 count 和总页数 total。 */
export function servicePage(data: any, project: (row: any) => any = (row) => row) {
  const source = Array.isArray(data) ? data : (data?.data ?? data?.rows ?? data?.records ?? []);
  const rows = Array.isArray(source) ? source.map(project) : [];
  return {
    rows,
    count: data?.count ?? rows.length,
    page: data?.page ?? 1,
    size: data?.size ?? rows.length,
    totalPages: data?.total ?? 1
  };
}

/**
 * 把传输异常归入固定类别：超时/取消、配置缺失、响应无效或网络失败。
 * 只输出固定文案，不回显原始异常文本，避免传输细节进入模型上下文。
 */
function requestFailureReason(error: unknown): string {
  if (error instanceof NexConfigurationError) return 'missing NexBrowser API configuration';
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
    return 'request timed out or was cancelled';
  if (error instanceof Error && /^HTTP \d+/.test(error.message))
    return 'invalid response from NexBrowser Desktop';
  return 'network error reaching NexBrowser Desktop';
}

/** 为独立业务工具复用传输和错误处理；资源模型、状态及展示仍由模块定义。 */
export function serviceTool<S extends z.ZodType>(options: {
  name: string;
  description: string;
  schema: S;
  route: string;
  method?: 'GET' | 'POST';
  readOnly?: boolean;
  consequential?: boolean;
  reconcile?: string;
  project: (data: any, args: z.output<S>) => { text: string; data: Record<string, unknown> };
}): McpToolSpec {
  return defineTool({
    name: options.name,
    description: options.description,
    inputSchema: options.schema,
    annotations: options.consequential
      ? { destructiveHint: true, idempotentHint: false }
      : options.readOnly
        ? { readOnlyHint: true }
        : { readOnlyHint: false },
    execute: async (args, ctx) => {
      const method = options.method ?? 'GET';
      const query = new URLSearchParams();
      if (method === 'GET') {
        for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
          if (value !== undefined) query.set(key, String(value));
        }
      }
      let response;
      try {
        const queryString = query.toString();
        response = await ctx.api.request(
          queryString ? `${options.route}?${queryString}` : options.route,
          {
            method,
            ...(method === 'POST' ? { body: JSON.stringify(args) } : {})
          }
        );
      } catch (error) {
        const reason = requestFailureReason(error);
        return errorResult(
          options.reconcile
            ? `Request outcome is unknown (${reason}). ${options.reconcile} Do not automatically repeat this operation.`
            : `Service request failed (${reason}). Check the connection and current login.`,
          { code: options.reconcile ? 'OUTCOME_UNKNOWN' : 'REQUEST_FAILED', reason }
        );
      }
      if (response.code !== 0) {
        const result = apiErrorResult('Service request failed', response);
        if (options.reconcile)
          result.content.push({
            type: 'text',
            text: `${options.reconcile} Do not automatically repeat this operation.`
          });
        return result;
      }
      const result = options.project(response.data, args);
      return successResult(result.text, result.data);
    }
  });
}
