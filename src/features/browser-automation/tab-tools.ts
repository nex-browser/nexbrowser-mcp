import { z } from 'zod';
import { bindTools, defineTool, type McpToolSpec } from '../../shared/define-tool.js';
import type { McpToolDefinition } from '../../shared/types.js';
import { NexApiClient } from '../../transport/nex-api-client.js';
import { tabOperationRoute, tabsRoute } from '../../transport/routes.js';
import { callEndpoint, requiredText, sessionId } from './common.js';
import { SESSION_PROPERTIES } from './schema.js';

// Tab tools address the whole session, so only the shared sessionId field applies. 标签页工具作用于整个会话，因此只复用共享的 sessionId 字段。
const baseSchema = z.object({ sessionId: SESSION_PROPERTIES.sessionId }).strict();

/** Tab tool specifications using stable page IDs. 使用稳定 pageId 的标签页工具规格。 */
export const TAB_TOOL_SPECS: readonly McpToolSpec[] = [
  defineTool({
    name: 'browser_tab_list',
    description: 'List tabs and the active stable page ID for an automation session.',
    annotations: { readOnlyHint: true },
    inputSchema: baseSchema,
    execute: async (args, ctx) =>
      callEndpoint(
        ctx.api,
        tabsRoute(sessionId(args, ctx.sessions)),
        { method: 'GET' },
        'Browser tabs.'
      )
  }),
  defineTool({
    name: 'browser_tab_new',
    description: 'Open a new tab and optionally navigate it.',
    inputSchema: baseSchema.extend({ url: z.string().optional() }),
    execute: async (args, ctx) =>
      callEndpoint(
        ctx.api,
        tabsRoute(sessionId(args, ctx.sessions)),
        { method: 'POST', body: JSON.stringify(args.url ? { url: String(args.url) } : {}) },
        'Browser tab opened.'
      )
  }),
  ...(['select', 'close'] as const).map((operation) =>
    defineTool({
      name: `browser_tab_${operation}`,
      description: `${operation === 'select' ? 'Select' : 'Close'} a tab by stable page ID.`,
      ...(operation === 'close' ? { annotations: { destructiveHint: true } } : {}),
      inputSchema: baseSchema.extend({ pageId: z.string() }),
      execute: async (args, ctx) =>
        callEndpoint(
          ctx.api,
          tabOperationRoute(sessionId(args, ctx.sessions), operation),
          {
            method: 'POST',
            body: JSON.stringify({ pageId: requiredText(args.pageId, 'pageId') })
          },
          `Browser tab ${operation === 'select' ? 'selected' : 'closed'}.`
        )
    })
  )
];

/** Creates tab management tools. 创建标签页管理工具。 */
export function createTabTools(client: NexApiClient): McpToolDefinition[] {
  return bindTools(TAB_TOOL_SPECS, { api: client, sessions: client });
}
