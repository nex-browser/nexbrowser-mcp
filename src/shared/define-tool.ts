import type { z, ZodType } from 'zod';
import type {
  ActiveSessionStore,
  McpToolDefinition,
  McpToolResult,
  NexApiRequester,
  ToolAnnotations
} from './types.js';

/**
 * Execution context injected by the composition root; tool bodies must reach
 * the network and session state only through it.
 * 由组合根注入的执行上下文；工具体只允许经由它触达网络与会话状态。
 */
export interface ToolContext {
  api: NexApiRequester;
  sessions: ActiveSessionStore;
}

/**
 * Declarative, client-free tool spec. The TOOLS preview maps over these with
 * zero side effects; bindTools() turns them into executable definitions.
 * 声明式、无客户端的工具规格；TOOLS 预览直接由它映射（零副作用），
 * bindTools() 将其绑定为可执行定义。
 */
export interface McpToolSpec<S extends ZodType = ZodType> {
  name: string;
  description: string;
  inputSchema: S;
  /** Reserved grouping hint; the catalog generator currently groups by spec arrays and ignores it. 预留的分组提示；目录生成器目前按规格数组分组，不读取该字段。 */
  docGroup?: string;
  /**
   * MCP behavior hints surfaced to clients for permission tiering
   * (readOnlyHint for pure reads, destructiveHint for closers).
   * MCP 行为注解，供客户端做权限分级（纯读标 readOnlyHint，关闭类标 destructiveHint）。
   */
  annotations?: ToolAnnotations;
  execute: (args: z.output<S>, ctx: ToolContext) => Promise<McpToolResult>;
}

/**
 * Definition helper that keeps literal schema inference so execute() sees
 * statically typed args.
 * 保留字面 schema 类型推断的定义助手，使 execute 的 args 获得静态类型。
 */
export function defineTool<S extends ZodType>(spec: McpToolSpec<S>): McpToolSpec {
  return spec as unknown as McpToolSpec;
}

/**
 * Binds specs to a live context, producing the public
 * McpToolDefinition shape. parse() also covers direct execute() callers
 * (tests, embedded hosts) that bypass SDK-side validation.
 * 将规格绑定到运行上下文，产出公共 McpToolDefinition 形状。
 * parse() 兜底：绕过 SDK 校验直接调用 execute 的路径（测试、内嵌宿主）由此获得同等校验。
 */
export function bindTools(specs: readonly McpToolSpec[], ctx: ToolContext): McpToolDefinition[] {
  return specs.map((spec) => ({
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    ...(spec.annotations ? { annotations: spec.annotations } : {}),
    execute: (arguments_) => spec.execute(spec.inputSchema.parse(arguments_), ctx)
  }));
}
