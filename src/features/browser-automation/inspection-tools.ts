import { z } from 'zod';
import { bindTools, defineTool, type McpToolSpec } from '../../shared/define-tool.js';
import type { McpToolDefinition } from '../../shared/types.js';
import { NexApiClient } from '../../transport/nex-api-client.js';
import { callAction } from './common.js';
import { automationSchema, TARGET_PROPERTY } from './schema.js';

// Page-code execution remains a distinct permission-gated tool. 页面代码执行是独立的权限受控工具。
const RUN_CODE = defineTool({
  name: 'browser_run_code',
  description: 'Run page JavaScript when the separate runCode permission is enabled.',
  inputSchema: automationSchema({ code: z.string() }),
  execute: (args, ctx) => callAction(ctx, args, 'runCode', { code: args.code }, 'Code result.')
});

/**
 * Snapshot, page reading, buffered event, dialog, and permission-gated script specs.
 * 快照、页面读取、事件缓冲、对话框及权限受控脚本规格。
 */
export const INSPECTION_TOOL_SPECS: readonly McpToolSpec[] = [
  defineTool({
    name: 'browser_snapshot',
    description: 'Capture an accessibility/ARIA snapshot with short-lived actionable refs.',
    annotations: { readOnlyHint: true },
    inputSchema: automationSchema({
      target: TARGET_PROPERTY.optional(),
      depth: z.number().min(1).max(100).optional(),
      boxes: z.boolean().optional()
    }),
    execute: (args, ctx) =>
      callAction(
        ctx,
        args,
        'snapshot',
        { target: args.target, depth: args.depth, boxes: args.boxes },
        'Page snapshot.'
      )
  }),
  ...(
    [
      ['browser_page_title', 'title', 'Page title.'],
      ['browser_page_url', 'url', 'Page URL.']
    ] as const
  ).map(([name, action, label]) =>
    defineTool({
      name,
      description: label,
      annotations: { readOnlyHint: true },
      inputSchema: automationSchema(),
      execute: (args, ctx) => callAction(ctx, args, action, {}, label)
    })
  ),
  defineTool({
    name: 'browser_get_text',
    description: 'Read visible text from the page or one target.',
    annotations: { readOnlyHint: true },
    inputSchema: automationSchema({ target: TARGET_PROPERTY.optional() }),
    execute: (args, ctx) => callAction(ctx, args, 'text', { target: args.target }, 'Page text.')
  }),
  // The two buffer readers below omit readOnlyHint because clear=true empties the session buffer. 下方两个缓冲读取工具未标 readOnlyHint，因为 clear=true 会清空会话缓冲。
  defineTool({
    name: 'browser_console_messages',
    description: 'Read console messages buffered by this automation session.',
    inputSchema: automationSchema({ clear: z.boolean().optional() }),
    execute: (args, ctx) =>
      callAction(ctx, args, 'consoleMessages', { clear: args.clear }, 'Console messages.')
  }),
  defineTool({
    name: 'browser_network_requests',
    description: 'Read network requests buffered by this automation session.',
    inputSchema: automationSchema({ clear: z.boolean().optional() }),
    execute: (args, ctx) =>
      callAction(ctx, args, 'networkRequests', { clear: args.clear }, 'Network requests.')
  }),
  defineTool({
    name: 'browser_network_request',
    description: 'Read one buffered network request by its 1-based index.',
    annotations: { readOnlyHint: true },
    inputSchema: automationSchema({ index: z.number().min(1) }),
    // Reuses the networkRequests action; index selects a single buffered entry without clearing. 复用 networkRequests 动作；index 选取单条缓冲记录且不清空。
    execute: (args, ctx) =>
      callAction(ctx, args, 'networkRequests', { index: args.index }, 'Network request.')
  }),
  defineTool({
    name: 'browser_handle_dialog',
    description: 'List pending dialogs or accept/dismiss one dialog.',
    inputSchema: automationSchema({
      id: z.number().min(1).optional(),
      accept: z.boolean().optional(),
      dismiss: z.boolean().optional(),
      promptText: z.string().optional()
    }),
    execute: (args, ctx) =>
      callAction(
        ctx,
        args,
        'dialogs',
        { id: args.id, accept: args.accept, dismiss: args.dismiss, promptText: args.promptText },
        'Dialog state.'
      )
  }),
  defineTool({
    name: 'browser_evaluate',
    description: 'Evaluate JavaScript when the dedicated evaluate permission is enabled.',
    inputSchema: automationSchema({ expression: z.string() }),
    execute: (args, ctx) =>
      callAction(ctx, args, 'evaluate', { expression: args.expression }, 'Evaluation result.')
  }),
  RUN_CODE
];

/**
 * Creates snapshot, page reading, buffered event, dialog, and permission-gated script tools.
 * 创建快照、页面读取、事件缓冲、对话框及权限受控脚本工具。
 */
export function createInspectionTools(client: NexApiClient): McpToolDefinition[] {
  return bindTools(INSPECTION_TOOL_SPECS, { api: client, sessions: client });
}
