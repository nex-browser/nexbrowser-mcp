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
        /does not enumerate operating-system application windows/i
      );
      const listed = await session.client.listTools();
      expect(listed.tools.find((tool) => tool.name === 'nex_list_browsers')?.description).toMatch(
        /count NexBrowser browser environments/i
      );
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
      expect(names).toEqual(
        expect.arrayContaining(['nex_list_browsers', 'nex_browser_connect', 'browser_snapshot'])
      );

      const result = await session.client.callTool({
        name: 'nex_list_browsers',
        arguments: { teamId: 'team-1' }
      });
      expect(result.isError).not.toBe(true);
      // nex_list_browsers forwards to the NexBrowser OpenAPI screen-list endpoint.
      // nex_list_browsers 转发到 NexBrowser OpenAPI 的环境列表端点。
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:45536/screen_load',
        expect.objectContaining({ method: 'POST' })
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
        name: 'browser_resize',
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
      const result = await session.client.callTool({ name: 'browser_tab_list', arguments: {} });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ code: 'INVALID_ARGUMENT' });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await session.close();
    }
  });

  it('exports Zod schemas as standard JSON Schema for host previews', () => {
    const resizeTool = TOOLS.find((tool) => tool.name === 'browser_resize');
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
