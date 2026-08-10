import { bindTools, type McpToolSpec } from '../../shared/define-tool.js';
import type { McpToolDefinition } from '../../shared/types.js';
import { NexApiClient } from '../../transport/nex-api-client.js';
import { ARTIFACT_TOOL_SPECS } from './artifact-tools.js';
import { INSPECTION_TOOL_SPECS } from './inspection-tools.js';
import { INTERACTION_TOOL_SPECS } from './interaction-tools.js';
import { SESSION_TOOL_SPECS } from './session-tools.js';
import { TAB_TOOL_SPECS } from './tab-tools.js';

/**
 * All automation specs; array order equals MCP registration order — do not reorder.
 * 全部自动化规格；数组顺序即 MCP 注册顺序，禁止调整。
 */
export const AUTOMATION_TOOL_SPECS: readonly McpToolSpec[] = [
  ...SESSION_TOOL_SPECS,
  ...TAB_TOOL_SPECS,
  ...INTERACTION_TOOL_SPECS,
  ...INSPECTION_TOOL_SPECS,
  ...ARTIFACT_TOOL_SPECS
];

/**
 * Binds every automation spec to one NexApiClient, which serves as both transport and the implicit active-session store.
 * 将全部自动化规格绑定到单个 NexApiClient，它同时充当传输层与隐式活动会话存储。
 */
export function createBrowserAutomationTools(client: NexApiClient): McpToolDefinition[] {
  return bindTools(AUTOMATION_TOOL_SPECS, { api: client, sessions: client });
}
