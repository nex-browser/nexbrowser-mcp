import { z } from 'zod';
import { defineTool, type McpToolSpec } from '../../shared/define-tool.js';
import { invalidArguments } from '../../shared/tool-result.js';
import { SESSIONS_ROOT, sessionRoute } from '../../transport/routes.js';
import { PAGE_CAPTCHA_GUIDANCE, PAGE_CAPTCHA_POINTER } from '../captcha/routing-guidance.js';
import { callEndpoint, sessionId } from './common.js';

// Clients send team/window IDs as string or number; both are stringified before transport. 客户端可能以字符串或数字传团队/窗口 ID；发送前统一字符串化。
const browserIdSchema = z.union([z.string(), z.number()]);

const CONNECT = defineTool({
  name: 'nex_browser_connect',
  description:
    'For nexbrowser-mcp browser tasks, use a NexBrowser environment by default. Connects one window (active team by default) and creates an isolated automation session; startIfNeeded=true opens a closed window. For several windows, call nex_browser_open once with all IDs, then connect each with startIfNeeded=false. ' +
    PAGE_CAPTCHA_POINTER,
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
      {
        success: `Browser automation session connected.\nPage CAPTCHA:\n${PAGE_CAPTCHA_GUIDANCE}`,
        failure: 'Failed to connect browser automation session'
      },
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
      {
        success: 'Browser automation session disconnected.',
        failure: 'Failed to disconnect browser automation session'
      },
      () => ctx.sessions.setActiveSessionId(undefined)
    )
});

/** Session lifecycle tool specifications. 会话生命周期工具规格。 */
export const SESSION_TOOL_SPECS: readonly McpToolSpec[] = [CONNECT, DISCONNECT];
