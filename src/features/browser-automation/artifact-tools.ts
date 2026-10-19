import { z } from 'zod';
import { bindTools, defineTool, type McpToolSpec } from '../../shared/define-tool.js';
import type { McpToolDefinition } from '../../shared/types.js';
import { NexApiClient } from '../../transport/nex-api-client.js';
import { PAGE_CAPTCHA_POINTER } from '../captcha/routing-guidance.js';
import { callAction } from './common.js';
import { automationSchema, TARGET_PROPERTY } from './schema.js';

/**
 * Screenshot and file-transfer specs with managed artifact transport.
 * 带受管产物传输的截图与文件传输规格。
 */
export const ARTIFACT_TOOL_SPECS: readonly McpToolSpec[] = [
  defineTool({
    name: 'nex_browser_take_screenshot',
    description:
      'Capture the viewport, a target element, or a viewport-relative clip. target, clip and fullPage=true are mutually exclusive. CSS scale is the default; returned origin and pixelsPerCssPixel map image coordinates to viewport clicks. Includes page-injected extension overlays. ' +
      PAGE_CAPTCHA_POINTER,
    inputSchema: automationSchema({
      target: TARGET_PROPERTY.optional(),
      clip: z
        .object({
          x: z.number().min(0),
          y: z.number().min(0),
          width: z.number().positive(),
          height: z.number().positive()
        })
        .strict()
        .optional(),
      scale: z.enum(['css', 'device']).optional(),
      filename: z.string().optional(),
      type: z.enum(['png', 'jpeg']).optional(),
      fullPage: z.boolean().optional(),
      quality: z.number().min(1).max(100).optional()
    }),
    execute: (args, ctx) =>
      callAction(
        ctx,
        args,
        'screenshot',
        {
          target: args.target,
          clip: args.clip,
          scale: args.scale,
          filename: args.filename,
          type: args.type,
          fullPage: args.fullPage,
          quality: args.quality
        },
        'Screenshot captured.'
      )
  }),
  defineTool({
    name: 'nex_browser_file_upload',
    description: 'Upload approved local files through a file input target.',
    inputSchema: automationSchema({
      target: TARGET_PROPERTY,
      files: z.array(z.string()).min(1)
    }),
    execute: (args, ctx) =>
      callAction(
        ctx,
        args,
        'uploadFiles',
        { target: args.target, files: args.files },
        'Files uploaded.'
      )
  }),
  defineTool({
    name: 'nex_browser_drop',
    description: 'Drop approved files or MIME-typed text data onto a target.',
    inputSchema: automationSchema({
      target: TARGET_PROPERTY,
      paths: z.array(z.string()).optional(),
      data: z.record(z.string(), z.string()).optional()
    }),
    // The public paths argument maps to the backend action's files parameter. 公开的 paths 参数映射为后端动作的 files 参数。
    execute: (args, ctx) =>
      callAction(
        ctx,
        args,
        'drop',
        { target: args.target, files: args.paths, data: args.data },
        'Data dropped.'
      )
  })
];

/**
 * Creates screenshot and file-transfer tools with managed artifact transport.
 * 创建带受管产物传输的截图与文件传输工具。
 */
export function createArtifactTools(client: NexApiClient): McpToolDefinition[] {
  return bindTools(ARTIFACT_TOOL_SPECS, { api: client, sessions: client });
}
