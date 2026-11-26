import { z } from 'zod';
import { defineTool, type McpToolSpec, type ToolContext } from '../../shared/define-tool.js';
import { errorResult, invalidArguments, successResult } from '../../shared/tool-result.js';
import type { ActiveSessionStore, McpContent, McpToolResult } from '../../shared/types.js';
import { ARTIFACT_TOOL_SPECS } from './artifact-tools.js';
import { INSPECTION_TOOL_SPECS } from './inspection-tools.js';
import { INTERACTION_TOOL_SPECS } from './interaction-tools.js';
import { SESSION_TOOL_SPECS } from './session-tools.js';
import { TAB_TOOL_SPECS } from './tab-tools.js';

const CONNECT_TOOL = 'nex_browser_connect';
const MAX_BATCH_TASKS = 100;

// Disconnect rewrites the default session; literal credentials stay on the single-call path. disconnect 会改写默认会话；明文凭据只走单次调用路径。
const EXCLUDED_TOOLS = new Set(['nex_browser_disconnect', 'nex_browser_fill_credentials']);

/**
 * Tools a batch may run: connect plus every per-session tool outside EXCLUDED_TOOLS.
 * Tools without a sessionId field cannot be targeted and are left out.
 * 批量可运行的工具：connect 与 EXCLUDED_TOOLS 之外所有按会话执行的工具；
 * 没有 sessionId 字段的工具无法指定目标，不支持。
 */
const BATCHABLE_SPECS: ReadonlyMap<string, McpToolSpec> = new Map(
  [
    ...SESSION_TOOL_SPECS,
    ...TAB_TOOL_SPECS,
    ...INTERACTION_TOOL_SPECS,
    ...INSPECTION_TOOL_SPECS,
    ...ARTIFACT_TOOL_SPECS
  ]
    .filter(
      (spec) =>
        spec.name === CONNECT_TOOL ||
        (!EXCLUDED_TOOLS.has(spec.name) &&
          'sessionId' in ((spec.inputSchema as z.ZodObject).shape ?? {}))
    )
    .map((spec) => [spec.name, spec])
);

const BATCHABLE_TOOL_NAMES = [...BATCHABLE_SPECS.keys()] as [string, ...string[]];

interface PreparedTask {
  index: number;
  spec: McpToolSpec;
  args: Record<string, any>;
  /** sessionId for actions, windowId for connect. */
  target: string;
}

interface TaskOutcome {
  task: PreparedTask;
  result: McpToolResult;
}

/**
 * Validates every task before any request is sent: each needs a known tool, valid arguments,
 * an explicit target, and a target no other task in the batch uses.
 * 发出任何请求前校验全部任务：工具已知、参数合法、目标显式指定，且同一批次内目标不重复。
 */
function prepareTasks(
  tasks: Array<{ tool: string; arguments: Record<string, unknown> }>
): PreparedTask[] | string {
  const prepared: PreparedTask[] = [];
  const seenTargets = new Set<string>();
  for (const [index, task] of tasks.entries()) {
    const spec = BATCHABLE_SPECS.get(task.tool);
    if (!spec) return `tasks[${index}]: ${task.tool} cannot run in a batch`;
    const parsed = spec.inputSchema.safeParse(task.arguments ?? {});
    if (!parsed.success) {
      return `tasks[${index}] (${task.tool}): ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'arguments'} ${issue.message}`).join('; ')}`;
    }
    const args = parsed.data as Record<string, any>;
    const isConnect = spec.name === CONNECT_TOOL;
    const rawTarget = isConnect ? args.windowId : args.sessionId;
    const target = rawTarget === undefined || rawTarget === null ? '' : String(rawTarget).trim();
    if (!target) {
      return `tasks[${index}] (${task.tool}): ${isConnect ? 'windowId' : 'sessionId'} is required in a batch`;
    }
    const key = `${isConnect ? 'window' : 'session'}:${target}`;
    if (seenTargets.has(key)) {
      return `tasks[${index}] (${task.tool}): ${isConnect ? 'window' : 'session'} ${target} is already used by another task; run actions on one window in separate calls`;
    }
    seenTargets.add(key);
    prepared.push({ index, spec, args, target });
  }
  return prepared;
}

/**
 * Session store for connect tasks that records new sessions instead of switching the default,
 * so concurrent completions cannot pick the default by timing.
 * connect 任务使用的会话存储：只记录新会话、不切换默认会话，避免并发完成顺序决定默认值。
 */
function recordingSessions(
  base: ActiveSessionStore,
  record: (sessionId: string) => void
): ActiveSessionStore {
  return {
    getActiveSessionId: () => base.getActiveSessionId(),
    setActiveSessionId: (sessionId) => {
      if (sessionId) record(sessionId);
    },
    removeSessionId: (sessionId) => base.removeSessionId(sessionId)
  };
}

/** Runs one task; a thrown error becomes that task's failure instead of failing the batch. 执行单个任务；抛出的异常只算该任务失败，不影响整批。 */
async function runTask(task: PreparedTask, ctx: ToolContext): Promise<McpToolResult> {
  try {
    return await task.spec.execute(task.args, ctx);
  } catch (error) {
    if (ctx.signal?.aborted) throw error;
    return errorResult(`Task failed: ${error instanceof Error ? error.message : String(error)}`, {
      code: 'TASK_FAILED'
    });
  }
}

/** First text block of a result: the human-readable summary, without the JSON copy. 结果的首个文本块：可读摘要，不含 JSON 副本。 */
function primaryText(result: McpToolResult): string {
  const first = result.content.find((item) => item.type === 'text');
  return first && first.type === 'text' ? first.text : '';
}

/** Combines per-task results in task order into one MCP result. 按任务顺序把各任务结果合并为一个 MCP 结果。 */
function batchResult(outcomes: TaskOutcome[]): McpToolResult {
  const failed = outcomes.filter((outcome) => outcome.result.isError).length;
  const succeeded = outcomes.length - failed;
  const sections = outcomes.map(({ task, result }) => {
    const status = result.isError ? 'FAILED' : 'OK';
    return `### Task ${task.index + 1}: ${task.spec.name} (${task.target}) — ${status}\n${primaryText(result)}`;
  });
  const images: McpContent[] = outcomes.flatMap(({ result }) =>
    result.content.filter((item) => item.type === 'image')
  );
  const summary = `Batch finished: ${succeeded} succeeded, ${failed} failed.`;
  const structured = {
    succeeded,
    failed,
    results: outcomes.map(({ task, result }) => ({
      index: task.index,
      tool: task.spec.name,
      target: task.target,
      status: result.isError ? 'failed' : 'succeeded',
      ...(result.structuredContent ? { result: result.structuredContent } : {})
    }))
  };
  const text = [summary, ...sections].join('\n\n');
  if (succeeded === 0) return errorResult(text, structured);
  return successResult(text, structured, images);
}

/**
 * Runs actions on several windows in one call. MCP hosts usually execute non-read-only tools
 * one at a time, so separate calls for N windows wait for each other; a batch sends them together.
 * 一次调用在多个窗口上执行动作。MCP 宿主通常逐个执行非只读工具，N 个窗口分开调用会互相等待；
 * 批量调用会把它们同时发出。
 */
export const BATCH_TOOL_SPEC: McpToolSpec = defineTool({
  name: 'nex_browser_batch',
  description:
    'Run tools on several browser windows at the same time in one call. Use it whenever the same step (connect, navigate, click, snapshot, wait, screenshot, ...) must happen in two or more windows; separate calls run one after another. Each task names a tool and its arguments. Every task except nex_browser_connect must pass an explicit sessionId, and each session (or connect windowId) may appear in only one task; put dependent steps for one window in later calls. After connect tasks, the last listed successful connection becomes the default session. Results are returned in task order; one task failing does not stop the others.',
  inputSchema: z
    .object({
      tasks: z
        .array(
          z
            .object({
              tool: z.enum(BATCHABLE_TOOL_NAMES).describe('Tool to run for this window'),
              arguments: z
                .record(z.string(), z.unknown())
                .describe(
                  'Arguments for that tool, including sessionId (or windowId for nex_browser_connect)'
                )
            })
            .strict()
        )
        .min(1)
        .max(MAX_BATCH_TASKS)
    })
    .strict(),
  execute: async (args, ctx) => {
    const prepared = prepareTasks(args.tasks);
    if (typeof prepared === 'string') return invalidArguments(prepared);

    const connected = new Map<number, string>();
    const outcomes = await Promise.all(
      prepared.map(async (task): Promise<TaskOutcome> => {
        const taskCtx =
          task.spec.name === CONNECT_TOOL
            ? {
                ...ctx,
                sessions: recordingSessions(ctx.sessions, (id) => connected.set(task.index, id))
              }
            : ctx;
        return { task, result: await runTask(task, taskCtx) };
      })
    );
    // Register new sessions in task order so the last listed connection becomes the default. 按任务顺序登记新会话，使排在最后的连接成为默认会话。
    for (const task of prepared) {
      const id = connected.get(task.index);
      if (id) ctx.sessions.setActiveSessionId(id);
    }
    return batchResult(outcomes);
  }
});
