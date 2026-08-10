import { z } from 'zod';

/**
 * Shared zod vocabulary for automation tools; the only place these field
 * definitions may live.
 * 自动化工具共享的 zod 词汇；这些字段定义唯一允许存在的位置。
 */
export const SESSION_PROPERTIES = {
  sessionId: z
    .string()
    .describe('Optional session ID; defaults to this MCP client active session')
    .optional(),
  pageId: z.string().describe('Stable page ID; defaults to the session active page').optional()
};

/**
 * Shared locator field: a snapshot ref or unique CSS selector, resolved server-side.
 * 共享定位字段：快照 ref 或唯一 CSS 选择器，由服务端解析。
 */
export const TARGET_PROPERTY = z
  .string()
  .describe('Snapshot ref such as e12, aria-ref=e12, or a unique CSS selector');

/**
 * Builds the strict input schema every automation tool must use: the shared
 * session and page fields plus the tool-specific shape; unknown keys are rejected.
 * 构建所有自动化工具必须使用的严格输入 schema：
 * 共享会话与页面字段加上工具特有字段；未知键会被拒绝。
 */
export function automationSchema<T extends z.ZodRawShape>(shape: T = {} as T) {
  return z.object({ ...SESSION_PROPERTIES, ...shape }).strict();
}
