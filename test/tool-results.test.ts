import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserAutomationTools,
  createBrowserManagementTools,
  type NexApiClient
} from '../src/index.js';

const ONE_PIXEL_RED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXY/jPwPAfAAUAAf+mXJtdAAAAAElFTkSuQmCC';

describe('tool result mapping', () => {
  it('opens multiple NexBrowser windows in one batch request', async () => {
    const request = vi.fn(async () => ({
      code: 0,
      msg: 'ok',
      data: {
        rows: [
          { windowId: 'window-1', success: true },
          { windowId: 'window-2', success: true }
        ]
      }
    }));
    const client = { request } as unknown as NexApiClient;
    const tool = createBrowserManagementTools(client).find(
      (candidate) => candidate.name === 'nex_browser_open'
    );

    const result = await tool!.execute({
      teamId: 'team-1',
      windowId: ['window-1', 'window-2']
    });

    expect(result.isError).not.toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      '/browser/open',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          teamId: 'team-1',
          ids: ['window-1', 'window-2']
        })
      })
    );
    expect(result.structuredContent).toMatchObject({ success: 2, failed: 0, total: 2 });
  });

  it('accepts documented ids when opening browsers', async () => {
    const request = vi.fn(async () => ({
      code: 0,
      msg: 'ok',
      data: { windowId: 'window-1', success: true }
    }));
    const client = { request } as unknown as NexApiClient;
    const tool = createBrowserManagementTools(client).find(
      (candidate) => candidate.name === 'nex_browser_open'
    );

    await tool!.execute({ teamId: 'team-1', ids: 'window-1' });
    expect(request).toHaveBeenCalledWith(
      '/browser/open',
      expect.objectContaining({
        body: JSON.stringify({ teamId: 'team-1', ids: ['window-1'] })
      })
    );
  });

  it('lists every running window when connection_info omits windowId', async () => {
    const request = vi.fn(async () => ({ code: 0, msg: 'ok', data: [] }));
    const client = { request } as unknown as NexApiClient;
    const tool = createBrowserManagementTools(client).find(
      (candidate) => candidate.name === 'nex_browser_connection_info'
    );

    const result = await tool!.execute({});
    expect(result.isError).not.toBe(true);
    expect(request).toHaveBeenCalledWith(
      '/browser/connection_info',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('connects with the active NexBrowser team when teamId is omitted', async () => {
    const request = vi.fn(async () => ({
      code: 0,
      msg: 'ok',
      data: { sessionId: 'session-1' }
    }));
    const client = {
      request,
      setActiveSessionId: vi.fn()
    } as unknown as NexApiClient;
    const tool = createBrowserAutomationTools(client).find(
      (candidate) => candidate.name === 'nex_browser_connect'
    );

    expect(tool).toBeDefined();
    const result = await tool!.execute({ windowId: 'window-1' });
    expect(result.isError).not.toBe(true);
    // An omitted teamId must be absent from the body (the server resolves the
    // active team) and startIfNeeded must default to false so connecting never
    // launches a window implicitly.
    // 未传 teamId 时请求体中必须不含该字段（由服务端解析活动团队），
    // 且 startIfNeeded 必须默认为 false，连接操作绝不能隐式启动窗口。
    expect(request).toHaveBeenCalledWith(
      '/automation/sessions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          windowId: 'window-1',
          startIfNeeded: false
        })
      })
    );
  });

  it('forwards an explicitly supplied teamId for nex-agent callers', async () => {
    const request = vi.fn(async () => ({
      code: 0,
      msg: 'ok',
      data: { sessionId: 'session-1' }
    }));
    const client = {
      request,
      setActiveSessionId: vi.fn()
    } as unknown as NexApiClient;
    const tool = createBrowserAutomationTools(client).find(
      (candidate) => candidate.name === 'nex_browser_connect'
    );

    await tool!.execute({ teamId: 'team-1', windowId: 'window-1' });
    expect(request).toHaveBeenCalledWith(
      '/automation/sessions',
      expect.objectContaining({
        body: JSON.stringify({
          teamId: 'team-1',
          windowId: 'window-1',
          startIfNeeded: false
        })
      })
    );
  });

  it('marks non-zero OpenAPI responses as MCP errors', async () => {
    const client = {
      request: async () => ({ code: 'WINDOW_NOT_FOUND', msg: 'missing', data: null })
    } as unknown as NexApiClient;
    const tool = createBrowserManagementTools(client).find(
      (candidate) => candidate.name === 'nex_browser_connection_info'
    );

    expect(tool).toBeDefined();
    const result = await tool!.execute({ teamId: 'team-1', windowId: 'window-1' });
    expect(result).toMatchObject({
      isError: true,
      structuredContent: { code: 'WINDOW_NOT_FOUND' }
    });
  });

  it('appends a recovery hint for known automation error codes', async () => {
    const client = {
      getActiveSessionId: () => 'session-1',
      request: async () => ({ code: 'SESSION_NOT_FOUND', msg: 'Session not found', data: null })
    } as unknown as NexApiClient;
    const tool = createBrowserAutomationTools(client).find(
      (candidate) => candidate.name === 'nex_browser_snapshot'
    );

    const result = await tool!.execute({});
    expect(result.isError).toBe(true);
    // The hint must reach both channels: structuredContent for structured-aware
    // hosts and the text block for hosts that only render plain content.
    // 恢复提示必须同时出现在两个通道：structuredContent 供支持结构化的宿主，
    // 文本块供仅渲染纯文本内容的宿主。
    expect(result.structuredContent).toMatchObject({
      code: 'SESSION_NOT_FOUND',
      hint: expect.stringContaining('nex_browser_connect')
    });
    expect((result.content[0] as { text: string }).text).toContain('nex_browser_connect');
  });

  it('maps screenshot artifacts to MCP image content', async () => {
    const client = {
      getActiveSessionId: () => 'session-1',
      request: async () => ({
        code: 0,
        msg: 'ok',
        data: {
          result: { path: 'shot.png' },
          artifacts: [{ base64: ONE_PIXEL_RED_PNG_BASE64, mimeType: 'image/png' }]
        }
      })
    } as unknown as NexApiClient;
    const tool = createBrowserAutomationTools(client).find(
      (candidate) => candidate.name === 'nex_browser_take_screenshot'
    );

    expect(tool).toBeDefined();
    const result = await tool!.execute({});
    expect(result.content).toContainEqual({
      type: 'image',
      data: ONE_PIXEL_RED_PNG_BASE64,
      mimeType: 'image/png'
    });
    const image = result.content.find((item) => item.type === 'image');
    expect(image).toBeDefined();
    expect([...Buffer.from(image!.data, 'base64').subarray(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    ]);
    expect(JSON.stringify(result.structuredContent)).not.toContain(ONE_PIXEL_RED_PNG_BASE64);
  });

  it('redacts CDP endpoints from text and structured management results by default', async () => {
    const client = {
      request: async () => ({
        code: 0,
        msg: 'ok',
        data: [
          {
            windowId: 'window-1',
            windowName: 'Test',
            ws: 'ws://127.0.0.1:9222/devtools/browser/secret',
            cdpHttpEndpoint: 'http://127.0.0.1:9222'
          }
        ]
      })
    } as unknown as NexApiClient;
    const tool = createBrowserManagementTools(client).find(
      (candidate) => candidate.name === 'nex_browser_connection_info'
    );

    const result = await tool!.execute({ teamId: 'team-1', windowId: 'window-1' });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('9222');
    expect(serialized).not.toContain('devtools/browser/secret');
  });

  it('returns CDP endpoints only after an explicit operator opt-in', async () => {
    const client = {
      exposeCdp: true,
      request: async () => ({
        code: 0,
        msg: 'ok',
        data: [{ windowId: 'window-1', ws: 'ws://127.0.0.1:9222/devtools/browser/allowed' }]
      })
    } as unknown as NexApiClient;
    const tool = createBrowserManagementTools(client).find(
      (candidate) => candidate.name === 'nex_browser_connection_info'
    );

    const result = await tool!.execute({ teamId: 'team-1', windowId: 'window-1' });
    expect(JSON.stringify(result)).toContain('devtools/browser/allowed');
  });
});
