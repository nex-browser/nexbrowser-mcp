import { z } from 'zod';
import { bindTools, defineTool, type McpToolSpec } from '../../shared/define-tool.js';
import { invalidArguments } from '../../shared/tool-result.js';
import type { McpToolDefinition, McpToolResult } from '../../shared/types.js';
import { NexApiClient } from '../../transport/nex-api-client.js';
import { callAction } from './common.js';
import { automationSchema, TARGET_PROPERTY } from './schema.js';

// Navigation specs are declared once and inserted in the public registration order. 导航规格集中声明，并按公开注册顺序插入。
const RELOAD = defineTool({
  name: 'browser_reload',
  description: 'Page reloaded.',
  inputSchema: automationSchema(),
  execute: (args, ctx) => callAction(ctx, args, 'reload', {}, 'Page reloaded.')
});

const GO_BACK = defineTool({
  name: 'browser_go_back',
  description: 'Navigated back.',
  inputSchema: automationSchema(),
  execute: (args, ctx) => callAction(ctx, args, 'goBack', {}, 'Navigated back.')
});

const GO_FORWARD = defineTool({
  name: 'browser_go_forward',
  description: 'Navigated forward.',
  inputSchema: automationSchema(),
  execute: (args, ctx) => callAction(ctx, args, 'goForward', {}, 'Navigated forward.')
});

/**
 * Navigation, element, keyboard, drag, scroll, wait, and viewport specs.
 * 导航、元素、键盘、拖拽、滚动、等待与视口规格。
 */
export const INTERACTION_TOOL_SPECS: readonly McpToolSpec[] = [
  defineTool({
    name: 'browser_navigate',
    description: 'Navigate the selected page and return its refreshed accessibility snapshot.',
    inputSchema: automationSchema({ url: z.string() }),
    execute: (args, ctx) => callAction(ctx, args, 'navigate', { url: args.url }, 'Page navigated.')
  }),
  RELOAD,
  GO_BACK,
  GO_FORWARD,
  defineTool({
    name: 'browser_click',
    description: 'Click or double-click an element from the latest snapshot or a CSS selector.',
    inputSchema: automationSchema({
      target: TARGET_PROPERTY,
      doubleClick: z.boolean().optional(),
      button: z.enum(['left', 'right', 'middle']).optional()
    }),
    execute: (args, ctx) =>
      callAction(
        ctx,
        args,
        args.doubleClick ? 'doubleClick' : 'click',
        { target: args.target, button: args.button },
        'Element clicked.'
      )
  }),
  defineTool({
    name: 'browser_hover',
    description: 'Hover over an element.',
    inputSchema: automationSchema({ target: TARGET_PROPERTY }),
    execute: (args, ctx) =>
      callAction(ctx, args, 'hover', { target: args.target }, 'Element hovered.')
  }),
  defineTool({
    name: 'browser_type',
    description: 'Type text into an element using sequential key events.',
    inputSchema: automationSchema({
      target: TARGET_PROPERTY,
      text: z.string(),
      delay: z.number().min(0).optional()
    }),
    execute: (args, ctx) =>
      callAction(
        ctx,
        args,
        'type',
        { target: args.target, text: args.text, delay: args.delay },
        'Text typed.'
      )
  }),
  defineTool({
    name: 'browser_fill_form',
    description: 'Fill one or more form controls in order.',
    inputSchema: automationSchema({
      fields: z
        .array(
          z.object({ target: TARGET_PROPERTY, value: z.union([z.string(), z.number()]) }).strict()
        )
        .min(1)
    }),
    execute: async (args, ctx) => {
      if (!Array.isArray(args.fields) || !args.fields.length)
        return invalidArguments('fields is required');
      // Fields fill sequentially; the first failure returns immediately, otherwise the last field's result stands for the batch. 字段按顺序填充；任一失败立即返回，否则以最后一个字段的结果代表整批。
      let result: McpToolResult = invalidArguments('fields is required');
      for (const field of args.fields) {
        result = await callAction(
          ctx,
          args,
          'fill',
          { target: field.target, value: String(field.value ?? '') },
          'Form field filled.'
        );
        if (result.isError) return result;
      }
      return result;
    }
  }),
  defineTool({
    name: 'browser_select_option',
    description: 'Select one or more values in a select control.',
    inputSchema: automationSchema({
      target: TARGET_PROPERTY,
      values: z.array(z.string()).min(1)
    }),
    execute: (args, ctx) =>
      callAction(
        ctx,
        args,
        'selectOption',
        { target: args.target, values: args.values },
        'Option selected.'
      )
  }),
  ...(['check', 'uncheck'] as const).map((action) =>
    defineTool({
      name: `browser_${action}`,
      description: `${action === 'check' ? 'Check' : 'Uncheck'} a checkbox or radio control.`,
      inputSchema: automationSchema({ target: TARGET_PROPERTY }),
      execute: (args, ctx) =>
        callAction(ctx, args, action, { target: args.target }, `Element ${action}ed.`)
    })
  ),
  defineTool({
    name: 'browser_press_key',
    description: 'Press a key on the selected page or focused element.',
    inputSchema: automationSchema({ target: TARGET_PROPERTY.optional(), key: z.string() }),
    execute: (args, ctx) =>
      callAction(ctx, args, 'press', { target: args.target, key: args.key }, 'Key pressed.')
  }),
  defineTool({
    name: 'browser_key_down',
    description: 'Hold a keyboard key down until browser_key_up is called.',
    inputSchema: automationSchema({ key: z.string() }),
    execute: (args, ctx) => callAction(ctx, args, 'keyDown', { key: args.key }, 'Key held down.')
  }),
  defineTool({
    name: 'browser_key_up',
    description: 'Release a keyboard key held by browser_key_down.',
    inputSchema: automationSchema({ key: z.string() }),
    execute: (args, ctx) => callAction(ctx, args, 'keyUp', { key: args.key }, 'Key released.')
  }),
  defineTool({
    name: 'browser_drag',
    description: 'Drag one snapshot ref or selector to another.',
    inputSchema: automationSchema({
      startTarget: TARGET_PROPERTY,
      endTarget: TARGET_PROPERTY
    }),
    execute: (args, ctx) =>
      callAction(
        ctx,
        args,
        'drag',
        { startTarget: args.startTarget, endTarget: args.endTarget },
        'Element dragged.'
      )
  }),
  defineTool({
    name: 'browser_scroll',
    description: 'Scroll the page, optionally bringing a target into view first.',
    inputSchema: automationSchema({
      target: TARGET_PROPERTY.optional(),
      deltaX: z.number().optional(),
      deltaY: z.number().optional()
    }),
    execute: (args, ctx) =>
      callAction(
        ctx,
        args,
        'scroll',
        { target: args.target, deltaX: args.deltaX, deltaY: args.deltaY },
        'Page scrolled.'
      )
  }),
  defineTool({
    name: 'browser_wait_for',
    description: 'Wait for a target, text, or a bounded duration.',
    inputSchema: automationSchema({
      target: TARGET_PROPERTY.optional(),
      text: z.string().optional(),
      time: z.number().min(0).max(120_000).optional(),
      timeout: z.number().min(1).max(120_000).optional()
    }),
    execute: (args, ctx) =>
      callAction(
        ctx,
        args,
        'wait',
        { target: args.target, text: args.text, time: args.time, timeout: args.timeout },
        'Wait completed.'
      )
  }),
  defineTool({
    name: 'browser_resize',
    description: 'Resize the active page viewport.',
    inputSchema: automationSchema({
      width: z.number().min(1).max(10_000),
      height: z.number().min(1).max(10_000)
    }),
    execute: (args, ctx) =>
      callAction(
        ctx,
        args,
        'resize',
        { width: args.width, height: args.height },
        'Viewport resized.'
      )
  })
];

/**
 * Creates navigation, element, keyboard, drag, scroll, wait, and viewport tools.
 * 创建导航、元素、键盘、拖拽、滚动、等待与视口工具。
 */
export function createInteractionTools(client: NexApiClient): McpToolDefinition[] {
  return bindTools(INTERACTION_TOOL_SPECS, { api: client, sessions: client });
}
