import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { z, type ZodType } from 'zod';

export type { ToolAnnotations };

/**
 * Connection configuration for Nex local OpenAPI.
 * Nex 本地 OpenAPI 的连接配置。
 */
export interface NexApiConfig {
  apiHost: string;
  apiKey: string;
  timeout: number;
  /** Expose raw CDP endpoints in management-tool results. Disabled by default. */
  exposeCdp?: boolean;
}

/**
 * Standard response envelope returned by Nex services.
 * Nex 服务端统一响应包络。
 */
export interface NexApiResponse<T = unknown> {
  /** Zero on success; failures may carry a numeric code or a stable AutomationErrorCode string. 成功为 0；失败时可能为数值码或稳定的 AutomationErrorCode 字符串。 */
  code: number | string;
  msg: string;
  data?: T;
}

/**
 * One SDK-compatible MCP content block.
 * 单个与 SDK 兼容的 MCP 内容块。
 */
export type McpContent = CallToolResult['content'][number];

/**
 * Standard MCP tool content, structured data, and failure marker.
 * MCP 工具返回的标准内容、结构化数据和失败标记。
 */
export type McpToolResult = CallToolResult;

/**
 * Public MCP tool definition.
 * MCP 对外公开的工具定义。
 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodType;
  /** MCP behavior hints (readOnlyHint/destructiveHint...). MCP 行为注解。 */
  annotations?: ToolAnnotations;
  execute: (arguments_: Record<string, any>) => Promise<McpToolResult>;
}

/**
 * JSON-serializable tool schema for hosts that list tools without executing them.
 * 供宿主在不执行的情况下列出工具的 JSON 可序列化 schema。
 */
export interface McpToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: ToolAnnotations;
}

/**
 * Converts any tool shape carrying name/description/schema into a public MCP tool schema.
 * 将携带名称/描述/schema 的任意工具形状转换为公开的 MCP 工具 schema。
 */
export function toToolSchema(
  tool: Pick<McpToolDefinition, 'name' | 'description' | 'inputSchema' | 'annotations'>
): McpToolSchema {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.inputSchema) as Record<string, unknown>,
    ...(tool.annotations ? { annotations: tool.annotations } : {})
  };
}

/**
 * Identifiable error thrown when required configuration is missing.
 * 配置缺失时抛出的可识别错误。
 */
export class NexConfigurationError extends Error {
  /**
   * Creates a configuration error with a stable error type.
   * 创建带稳定错误类型的配置异常。
   */
  constructor(message: string) {
    super(message);
    this.name = 'NexConfigurationError';
  }
}

/**
 * Narrow HTTP surface tools are allowed to touch; NexApiClient satisfies it structurally.
 * 工具允许触达的最小 HTTP 面；NexApiClient 结构化实现该接口。
 */
export interface NexApiRequester {
  readonly clientId: string;
  readonly exposeCdp?: boolean;
  request<T = unknown>(path: string, options?: RequestInit): Promise<NexApiResponse<T>>;
}

/**
 * Per-process implicit active session, decoupled from the client class so the
 * state can later move out of transport without touching any tool.
 * 进程内隐式活动会话的窄接口；与客户端类解耦，未来迁出状态时无需改动任何工具。
 */
export interface ActiveSessionStore {
  getActiveSessionId(): string | undefined;
  setActiveSessionId(sessionId: string | undefined): void;
}

/**
 * Typed local-argument failure; the entry catch-all maps it to a structured
 * INVALID_ARGUMENT result instead of bare error text.
 * 本地参数错误的类型化异常，entry 层统一映射为结构化 INVALID_ARGUMENT 结果。
 */
export class InvalidArgumentError extends Error {
  /**
   * Creates an argument error with a stable error type.
   * 创建带稳定错误类型的参数异常。
   */
  constructor(message: string) {
    super(message);
    this.name = 'InvalidArgumentError';
  }
}
