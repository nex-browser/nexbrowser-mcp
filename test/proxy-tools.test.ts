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

describe('nex_proxy_import', () => {
  it('forwards Desktop-compatible text and strips credentials from the result', async () => {
    const { request, tool } = toolWith('nex_proxy_import', {
      items: [
        {
          id: 9,
          protocol: 'SOCKS5',
          host: '1.2.3.4',
          port: 1080,
          username: 'agent-user',
          password: 'do-not-expose',
          remark: 'JP primary'
        }
      ],
      imported: 1,
      invalid: [
        { line: 'ftp://1.2.3.4:1080', error: '不支持的代理协议，仅支持 HTTP、HTTPS、SOCKS5' }
      ],
      duplicateCount: 0
    });

    const result = await tool.execute({
      text: 'socks5://agent-user:do-not-expose@1.2.3.4:1080 {JP primary}\nftp://1.2.3.4:1080'
    });

    expect(request).toHaveBeenLastCalledWith(
      '/proxy/import',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          text: 'socks5://agent-user:do-not-expose@1.2.3.4:1080 {JP primary}\nftp://1.2.3.4:1080'
        })
      })
    );
    const payload = JSON.stringify(result);
    expect(payload).toContain('Imported 1 proxy resource');
    expect(payload).toContain('JP primary');
    expect(payload).not.toContain('agent-user');
    expect(payload).not.toContain('do-not-expose');
    expect(payload).not.toContain('ftp://');
  });

  it('accepts a lines array when text is omitted', async () => {
    const { request, tool } = toolWith('nex_proxy_import', {
      items: [{ id: 9, protocol: 'HTTP', host: '10.0.0.8', port: 8080 }],
      imported: 1,
      invalid: [],
      duplicateCount: 0
    });

    await tool.execute({ lines: ['http://10.0.0.8:8080'] });

    expect(request).toHaveBeenLastCalledWith(
      '/proxy/import',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ lines: ['http://10.0.0.8:8080'] })
      })
    );
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
