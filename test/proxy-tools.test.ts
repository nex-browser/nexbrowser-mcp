import { describe, expect, it, vi } from 'vitest';
import { createBrowserManagementTools, type NexApiClient } from '../src/index.js';

function toolWith(name: string, data: unknown) {
  const request = vi.fn(async () => ({ code: 0, msg: 'ok', data }));
  const client = { request, getActiveSessionId: () => undefined } as unknown as NexApiClient;
  const tool = createBrowserManagementTools(client).find((candidate) => candidate.name === name)!;
  expect(tool, `Expected tool ${name} to be registered`).toBeDefined();
  return { request, tool };
}

describe('nex_proxy_list', () => {
  it('returns selectable proxy metadata without credentials', async () => {
    const { request, tool } = toolWith('nex_proxy_list', {
      data: [
        {
          id: 9,
          protocol: 'SOCKS5',
          host: 'proxy.example.com',
          port: 1080,
          username: 'agent-user',
          password: 'do-not-expose',
          activeIp: '203.0.113.8',
          country: 'Japan',
          remark: 'JP primary',
          bindScreen: [{ id: 22 }]
        }
      ],
      count: 1
    });

    const result = await tool.execute({ keyword: 'JP' });

    expect(request).toHaveBeenLastCalledWith(
      '/proxy/list?page=1&size=100&keyword=JP',
      expect.objectContaining({ method: 'GET' })
    );
    expect(JSON.stringify(result)).toContain('proxy.example.com');
    expect(JSON.stringify(result)).not.toContain('agent-user');
    expect(JSON.stringify(result)).not.toContain('do-not-expose');
  });
});

describe('nex_browser_bind_proxy', () => {
  it('binds one proxy to multiple closed windows', async () => {
    const { request, tool } = toolWith('nex_browser_bind_proxy', {
      rows: [
        { windowId: '22', proxyId: 9, success: true },
        { windowId: '23', proxyId: 9, success: true }
      ],
      success: 2,
      failed: 0,
      total: 2
    });

    const result = await tool.execute({ windowId: ['22', '23'], proxyId: 9 });

    expect(request).toHaveBeenLastCalledWith(
      '/browser/proxy',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ windowId: ['22', '23'], proxyId: 9 })
      })
    );
    expect(String((result.content[0] as { text: string }).text)).toContain('Success: 2');
  });

  it('uses proxyId zero to remove a binding', async () => {
    const { tool } = toolWith('nex_browser_bind_proxy', {
      rows: [{ windowId: '22', proxyId: 0, success: true }],
      success: 1,
      failed: 0,
      total: 1
    });

    const result = await tool.execute({ windowId: '22', proxyId: 0 });

    expect(String((result.content[0] as { text: string }).text)).toContain('Proxy binding removed');
  });
});
