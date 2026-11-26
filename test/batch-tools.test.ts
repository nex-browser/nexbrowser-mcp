import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMcpSession, installFetchMock } from './helpers.js';

const config = { apiHost: 'http://127.0.0.1:45536', apiKey: 'test', timeout: 2000 };
afterEach(() => vi.unstubAllGlobals());

type BatchResult = {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
  structuredContent?: {
    succeeded: number;
    failed: number;
    results: Array<{ index: number; tool: string; status: string; target: string }>;
  };
};

/**
 * Holds every request until `expected` requests are in flight at once, so a
 * sequential implementation times out instead of passing by luck.
 * 等到 expected 个请求同时在途后才一起放行，串行实现会因超时而失败。
 */
function concurrentGate(expected: number, respond: (url: string, body: any) => unknown) {
  let inFlight = 0;
  let maxInFlight = 0;
  let open!: () => void;
  const allArrived = new Promise<void>((resolve) => {
    open = resolve;
  });
  const fetchMock = installFetchMock(async (url, init) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    if (inFlight === expected) open();
    await Promise.race([allArrived, new Promise((resolve) => setTimeout(resolve, 300))]);
    inFlight--;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    return new Response(JSON.stringify(respond(String(url), body)));
  });
  return { fetchMock, maxInFlight: () => maxInFlight };
}

describe('nex_browser_batch', () => {
  it('sends the actions of different sessions at the same time', async () => {
    // Regression: MCP hosts run non-read-only tools one call at a time, so four
    // nex_browser_navigate calls reached NexBrowser 26.5 seconds apart.
    // Fixed by: one batch call that dispatches every session's action concurrently.
    const gate = concurrentGate(4, (url, body) => ({
      code: 0,
      data: { snapshot: `${url.split('/').at(-2)} at ${body.params.url}` }
    }));
    const session = await createMcpSession(config);
    try {
      const result = (await session.client.callTool({
        name: 'nex_browser_batch',
        arguments: {
          tasks: ['s1', 's2', 's3', 's4'].map((sessionId) => ({
            tool: 'nex_browser_navigate',
            arguments: { sessionId, url: `https://example.com/${sessionId}` }
          }))
        }
      })) as BatchResult;

      expect(gate.maxInFlight()).toBe(4);
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ succeeded: 4, failed: 0 });
      expect(result.structuredContent!.results.map((item) => item.target)).toEqual([
        's1',
        's2',
        's3',
        's4'
      ]);
      expect(result.content[0]!.text).toContain('s3 at https://example.com/s3');
    } finally {
      await session.close();
    }
  });

  it('connects windows concurrently and makes the last listed one the default session', async () => {
    let next = 0;
    const gate = concurrentGate(3, (_url, body) => ({
      code: 0,
      data: { sessionId: `session-${body.windowId}`, order: ++next }
    }));
    const session = await createMcpSession(config);
    try {
      const result = (await session.client.callTool({
        name: 'nex_browser_batch',
        arguments: {
          tasks: ['a', 'b', 'c'].map((windowId) => ({
            tool: 'nex_browser_connect',
            arguments: { windowId }
          }))
        }
      })) as BatchResult;
      expect(gate.maxInFlight()).toBe(3);
      expect(result.structuredContent).toMatchObject({ succeeded: 3, failed: 0 });

      await session.client.callTool({ name: 'nex_browser_page_url', arguments: {} });
      expect(String(gate.fetchMock.mock.calls.at(-1)?.[0])).toBe(
        `${config.apiHost}/automation/sessions/session-c/actions`
      );
    } finally {
      await session.close();
    }
  });

  it('reports each failure without hiding the tasks that succeeded', async () => {
    installFetchMock(async (url) =>
      String(url).includes('/s2/')
        ? new Response(JSON.stringify({ code: 'PAGE_NOT_FOUND', msg: 'page closed', data: null }))
        : new Response(JSON.stringify({ code: 0, data: { result: 'ok' } }))
    );
    const session = await createMcpSession(config);
    try {
      const partial = (await session.client.callTool({
        name: 'nex_browser_batch',
        arguments: {
          tasks: ['s1', 's2'].map((sessionId) => ({
            tool: 'nex_browser_page_title',
            arguments: { sessionId }
          }))
        }
      })) as BatchResult;
      expect(partial.isError).not.toBe(true);
      expect(partial.structuredContent).toMatchObject({ succeeded: 1, failed: 1 });
      expect(partial.structuredContent!.results.map((item) => item.status)).toEqual([
        'succeeded',
        'failed'
      ]);
      expect(partial.content[0]!.text).toContain('page closed');

      const allFailed = (await session.client.callTool({
        name: 'nex_browser_batch',
        arguments: { tasks: [{ tool: 'nex_browser_page_title', arguments: { sessionId: 's2' } }] }
      })) as BatchResult;
      expect(allFailed.isError).toBe(true);
    } finally {
      await session.close();
    }
  });

  it.each([
    [
      'a task without an explicit sessionId',
      [{ tool: 'nex_browser_navigate', arguments: { url: 'https://example.com' } }]
    ],
    [
      'two tasks on one session',
      [
        { tool: 'nex_browser_click', arguments: { sessionId: 's1', target: 'e1' } },
        { tool: 'nex_browser_click', arguments: { sessionId: 's1', target: 'e2' } }
      ]
    ],
    [
      'two connects to one window',
      [
        { tool: 'nex_browser_connect', arguments: { windowId: 'a' } },
        { tool: 'nex_browser_connect', arguments: { windowId: 'a' } }
      ]
    ],
    [
      'invalid task arguments',
      [{ tool: 'nex_browser_navigate', arguments: { sessionId: 's1', url: 42 } }]
    ]
  ])('rejects %s before sending any request', async (_case, tasks) => {
    const fetchMock = installFetchMock(async () => new Response('{"code":0,"data":null}'));
    const session = await createMcpSession(config);
    try {
      const result = (await session.client.callTool({
        name: 'nex_browser_batch',
        arguments: { tasks }
      })) as BatchResult;
      expect(result.isError).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await session.close();
    }
  });

  it('does not accept tools that are unsafe to run unordered', async () => {
    installFetchMock(async () => new Response('{"code":0,"data":null}'));
    const session = await createMcpSession(config);
    try {
      for (const tool of [
        'nex_browser_disconnect',
        'nex_browser_fill_credentials',
        'nex_browser_batch'
      ]) {
        const result = (await session.client.callTool({
          name: 'nex_browser_batch',
          arguments: { tasks: [{ tool, arguments: { sessionId: 's1' } }] }
        })) as BatchResult;
        expect(result.isError).toBe(true);
      }
    } finally {
      await session.close();
    }
  });
});
