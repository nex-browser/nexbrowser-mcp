import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOOLS } from '../src/index.js';
import { createMcpSession, installFetchMock } from './helpers.js';

const config = {
  apiHost: 'http://127.0.0.1:45536',
  apiKey: 'test-token',
  timeout: 2_000
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NexBrowser MCP protocol', () => {
  it('publishes routing guidance that distinguishes NexBrowser environments from OS windows', async () => {
    const session = await createMcpSession(config);

    try {
      expect(session.client.getInstructions()).toMatch(
        /never substitute the Browser plugin, Chrome plugin, computer-use/i
      );
      expect(session.client.getInstructions()).toContain(
        "'使用 NexBrowser 查看我有多少窗口' means call nex_browser_list"
      );
      const listed = await session.client.listTools();
      expect(listed.tools.find((tool) => tool.name === 'nex_browser_list')?.description).toMatch(
        /Preferred NexBrowser OpenAPI tool/i
      );
      expect(listed.tools.find((tool) => tool.name === 'nex_browser_list')?.description).toMatch(
        /Never reports Chrome, Edge, the Codex in-app browser/i
      );
      expect(listed.tools.filter((tool) => tool.name === 'nex_browser_list')).toHaveLength(1);
    } finally {
      await session.close();
    }
  });

  it('lists unified tools and forwards a management call to OpenAPI', async () => {
    const fetchMock = installFetchMock(
      async () => new Response(JSON.stringify({ code: 0, msg: 'ok', data: { data: [], count: 0 } }))
    );
    const session = await createMcpSession(config);

    try {
      const listed = await session.client.listTools();
      const names = listed.tools.map((tool) => tool.name);
      expect(names).toHaveLength(52);
      expect(
        names.every((name) => name.startsWith('nex_browser_') || name.startsWith('nex_proxy_'))
      ).toBe(true);
      expect(names).not.toEqual(
        expect.arrayContaining([
          'nexbrowser_list_windows',
          'nex_list_browsers',
          'nex_open_browsers',
          'browser_snapshot'
        ])
      );
      expect(names).toEqual(
        expect.arrayContaining([
          'nex_browser_list',
          'nex_browser_connect',
          'nex_browser_snapshot',
          'nex_browser_fill_credentials'
        ])
      );

      const result = await session.client.callTool({
        name: 'nex_browser_list',
        arguments: { teamId: 'team-1' }
      });
      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('NexBrowser managed windows/environments')
          })
        ])
      );
      // The preferred branded tool forwards to the NexBrowser OpenAPI window-list endpoint.
      // 首选品牌化工具转发到 NexBrowser OpenAPI 的环境列表端点。
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:45536/browser/list?page=1&size=100&teamId=team-1',
        expect.objectContaining({ method: 'GET' })
      );
    } finally {
      await session.close();
    }
  });

  it('validates tool arguments before invoking the OpenAPI client', async () => {
    const fetchMock = installFetchMock(
      async () => new Response(JSON.stringify({ code: 0, msg: 'ok', data: {} }))
    );
    const session = await createMcpSession(config);

    try {
      const result = await session.client.callTool({
        name: 'nex_browser_resize',
        arguments: { width: 0, height: 720 }
      });

      expect(result.isError).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await session.close();
    }
  });

  it('maps locally detectable argument failures to structured INVALID_ARGUMENT', async () => {
    const fetchMock = installFetchMock(
      async () => new Response(JSON.stringify({ code: 0, msg: 'ok', data: {} }))
    );
    const session = await createMcpSession(config);

    try {
      // No sessionId argument and no active session for this client.
      // 未传 sessionId 且该客户端没有活动会话。
      const result = await session.client.callTool({ name: 'nex_browser_tab_list', arguments: {} });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ code: 'INVALID_ARGUMENT' });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await session.close();
    }
  });

  it('exports Zod schemas as standard JSON Schema for host previews', () => {
    const resizeTool = TOOLS.find((tool) => tool.name === 'nex_browser_resize');
    const connectTool = TOOLS.find((tool) => tool.name === 'nex_browser_connect');

    expect(resizeTool?.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        width: { type: 'number', minimum: 1, maximum: 10_000 },
        height: { type: 'number', minimum: 1, maximum: 10_000 }
      },
      required: ['width', 'height'],
      additionalProperties: false
    });
    expect(connectTool?.inputSchema).toMatchObject({
      type: 'object',
      required: ['windowId']
    });
  });
});
