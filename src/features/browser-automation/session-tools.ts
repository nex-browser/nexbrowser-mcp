import { z } from 'zod';
import { bindTools, defineTool, type McpToolSpec } from '../../shared/define-tool.js';
import { invalidArguments } from '../../shared/tool-result.js';
import type { McpToolDefinition } from '../../shared/types.js';
import { NexApiClient } from '../../transport/nex-api-client.js';
import { SESSIONS_ROOT, sessionRoute } from '../../transport/routes.js';
import { callEndpoint, sessionId } from './common.js';

// Clients send team/window IDs as string or number; both are stringified before transport. 客户端可能以字符串或数字传团队/窗口 ID；发送前统一字符串化。
const browserIdSchema = z.union([z.string(), z.number()]);

const CONNECT = defineTool({
  name: 'nex_browser_connect',
  description:
    'Connect to one NexBrowser window using the active team by default and create an isolated automation session. For multiple windows, first call nex_browser_open once with all window IDs, then connect each window with startIfNeeded=false.',
  inputSchema: z
    .object({
      teamId: browserIdSchema
        .describe('Optional team ID. Omit it to use the team currently selected in NexBrowser.')
        .optional(),
      windowId: browserIdSchema,
      startIfNeeded: z
        .boolean()
        .describe(
          'Explicitly start one window when it is not running. Keep false after a multi-window batch open.'
        )
        .optional()
    })
    .strict(),
  execute: async (args, ctx) => {
    // Rejects falsy IDs ('' or 0) that still satisfy the union schema. 拦截满足联合 schema 的假值 ID（'' 或 0）。
    if (!args.windowId) return invalidArguments('windowId is required');
    return callEndpoint(
      ctx.api,
      SESSIONS_ROOT,
      {
        method: 'POST',
        body: JSON.stringify({
          ...(args.teamId ? { teamId: String(args.teamId) } : {}),
          windowId: String(args.windowId),
          startIfNeeded: args.startIfNeeded === true
        })
      },
      'Browser automation session connected.',
      (data) => ctx.sessions.setActiveSessionId(String(data?.sessionId || '') || undefined)
    );
  }
});

const DISCONNECT = defineTool({
  name: 'nex_browser_disconnect',
  description: 'Disconnect an automation session without closing the NexBrowser environment.',
  inputSchema: z.object({ sessionId: z.string().optional() }).strict(),
  execute: async (args, ctx) =>
    callEndpoint(
      ctx.api,
      sessionRoute(sessionId(args, ctx.sessions)),
      { method: 'DELETE' },
      'Browser automation session disconnected.',
      () => ctx.sessions.setActiveSessionId(undefined)
    )
});

/** Session lifecycle tool specifications. 会话生命周期工具规格。 */
export const SESSION_TOOL_SPECS: readonly McpToolSpec[] = [CONNECT, DISCONNECT];

/** Creates session lifecycle tools. 创建会话生命周期工具。 */
export function createSessionTools(client: NexApiClient): McpToolDefinition[] {
  return bindTools(SESSION_TOOL_SPECS, { api: client, sessions: client });
}
