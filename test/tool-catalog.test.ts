import { describe, expect, it } from 'vitest';
import { TOOLS } from '../src/index.js';
import { createMcpSession } from './helpers.js';

const config = {
  apiHost: 'http://127.0.0.1:45536',
  apiKey: 'test-token',
  timeout: 2_000
};

/**
 * Golden baseline: the LLM-visible tool surface (names/descriptions/schemas/order)
 * must stay byte-stable across refactors.
 * Update the baseline via `vitest -u` only for an intentional surface change,
 * and call it out in the PR.
 * 金基线：工具面（名称/描述/参数 Schema/顺序）是 LLM 可见契约，重构期间必须逐字节不变。
 * 仅当有意变更工具面时才允许 `vitest -u` 更新基线，并在 PR 中说明。
 */
describe('tool catalog golden baseline', () => {
  it('keeps the TOOLS preview surface stable', async () => {
    expect(TOOLS).toHaveLength(47);
    await expect(JSON.stringify(TOOLS, null, 2)).toMatchFileSnapshot(
      '__snapshots__/tools-preview.json'
    );
  });

  it('keeps the registered MCP tool surface stable', async () => {
    const session = await createMcpSession(config);
    try {
      const listed = await session.client.listTools();
      const catalog = listed.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        ...(tool.annotations ? { annotations: tool.annotations } : {})
      }));
      expect(catalog).toHaveLength(47);
      await expect(JSON.stringify(catalog, null, 2)).toMatchFileSnapshot(
        '__snapshots__/tools-registered.json'
      );
    } finally {
      await session.close();
    }
  });
});
