import { z } from 'zod';
import { ARTIFACT_TOOL_SPECS } from '../src/features/browser-automation/artifact-tools.js';
import { INSPECTION_TOOL_SPECS } from '../src/features/browser-automation/inspection-tools.js';
import { INTERACTION_TOOL_SPECS } from '../src/features/browser-automation/interaction-tools.js';
import { SESSION_TOOL_SPECS } from '../src/features/browser-automation/session-tools.js';
import { TAB_TOOL_SPECS } from '../src/features/browser-automation/tab-tools.js';
import { MANAGEMENT_TOOL_SPECS } from '../src/features/browser-management/browser-tools.js';
import type { McpToolSpec } from '../src/shared/define-tool.js';

/**
 * Session-default fields present on most automation schemas; documented once
 * in the catalog preamble instead of repeating per tool.
 * 大多数自动化 schema 都带的会话默认字段；在目录前言统一说明，不逐工具重复。
 */
const SESSION_DEFAULT_FIELDS = new Set(['sessionId', 'pageId']);

/**
 * Section order and membership are part of the pinned catalog output; any
 * reordering here changes the committed markdown.
 * 分组顺序与成员构成属于被钉死的目录输出；此处调整即改变仓库中的 markdown。
 */
const GROUPS: ReadonlyArray<{ title: string; note?: string; specs: readonly McpToolSpec[] }> = [
  {
    title: 'Environment Management',
    note: 'Stateless `nex_*` tools that manage NexBrowser environments; no automation session required.',
    specs: MANAGEMENT_TOOL_SPECS
  },
  { title: 'Connection', specs: SESSION_TOOL_SPECS },
  { title: 'Tabs', specs: TAB_TOOL_SPECS },
  { title: 'Interaction', specs: INTERACTION_TOOL_SPECS },
  { title: 'Inspection and Diagnostics', specs: INSPECTION_TOOL_SPECS },
  { title: 'Artifacts', specs: ARTIFACT_TOOL_SPECS }
];

/**
 * Renders the input list for one tool from its zod schema, skipping the shared
 * session-default fields.
 * 由 zod schema 渲染单个工具的参数列表，跳过共享的会话默认字段。
 */
function inputSummary(spec: McpToolSpec): string {
  const jsonSchema = z.toJSONSchema(spec.inputSchema) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  const required = new Set(jsonSchema.required ?? []);
  // Session-default fields stay hidden only while optional; when a tool makes
  // one required (e.g. tab select/close pageId) it must appear.
  // 会话默认字段仅在可选时隐藏；工具将其设为必填时（如 tab select/close 的 pageId）必须展示。
  const names = Object.keys(jsonSchema.properties ?? {}).filter(
    (name) => !SESSION_DEFAULT_FIELDS.has(name) || required.has(name)
  );
  if (!names.length) return '';
  const rendered = names.map((name) =>
    required.has(name) ? `\`${name}\` (required)` : `\`${name}\``
  );
  return ` Inputs: ${rendered.join(', ')}.`;
}

/** Renders one tool group. 渲染一个工具分组。 */
function groupSection(title: string, specs: readonly McpToolSpec[], note?: string): string {
  const lines: string[] = [`## ${title}`, ''];
  if (note) lines.push(note, '');
  for (const spec of specs) {
    const readOnly = spec.annotations?.readOnlyHint ? ' Read-only.' : '';
    lines.push(`- \`${spec.name}\` — ${spec.description}${readOnly}${inputSummary(spec)}`);
  }
  return lines.join('\n');
}

/**
 * Generates the skill tool catalog markdown from the live tool specs. The
 * committed file is pinned to this output by a drift test.
 * 从工具规格生成 skill 目录 markdown；漂移测试将仓库文件钉死在此输出上。
 */
export function generateSkillCatalog(): string {
  const sections = GROUPS.map((group) => groupSection(group.title, group.specs, group.note));
  return [
    '# NexBrowser Unified MCP Tool Catalog',
    '',
    "<!-- AUTO-GENERATED from this package's live tool specs.",
    '     Regenerate: pnpm gen:catalog',
    '     Do not edit by hand - a drift test pins this file to the specs. -->',
    '',
    'Start automation with `browser_snapshot` to obtain current page targets. A target is normally a bare snapshot ref such as `e12`; unique CSS selectors are a fallback.',
    '',
    "Most automation tools also accept optional `sessionId` (defaults to this client's active session) and `pageId` (defaults to the session's active page); they are omitted from the per-tool input lists below.",
    '',
    ...sections.flatMap((section) => [section, '']),
    '## Safety',
    '',
    "Tools marked read-only only inspect state. Navigation, clicks, typing, uploads, tab closing, and JavaScript that changes page state are consequential: use them only for the user's intended outcome.",
    ''
  ].join('\n');
}
