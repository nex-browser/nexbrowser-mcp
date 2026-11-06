import { afterEach, expect, it, vi } from 'vitest';
import { createMcpSession, installFetchMock } from './helpers.js';

const config = { apiHost: 'http://127.0.0.1:45536', apiKey: 'test', timeout: 2000 };
afterEach(() => vi.unstubAllGlobals());

// 通过真实 MCP 调用保留多个窗口连接，并逐个或一次释放。
it.each([false, true])('releases older connections with all=%s', async (all) => {
  let next = 0;
  const active = new Set<string>();
  installFetchMock(async (url, init) => {
    if (init?.method === 'POST') {
      const sessionId = `session-${++next}`;
      active.add(sessionId);
      return new Response(JSON.stringify({ code: 0, data: { sessionId } }));
    }
    if (init?.method === 'DELETE') {
      if (String(url).endsWith('/automation/sessions')) active.clear();
      else active.delete(String(url).split('/').at(-1)!);
    }
    return new Response('{"code":0,"data":null}');
  });
  const session = await createMcpSession(config);
  try {
    for (let index = 0; index < 2; index++) {
      expect(
        (
          await session.client.callTool({
            name: 'nex_browser_connect',
            arguments: { windowId: 'same-window' }
          })
        ).isError
      ).not.toBe(true);
    }
    expect(active.size).toBe(2);
    expect(
      (
        await session.client.callTool({
          name: 'nex_browser_disconnect',
          arguments: all ? { all: true } : {}
        })
      ).isError
    ).not.toBe(true);
    if (!all) {
      expect([...active]).toEqual(['session-1']);
      expect(
        (await session.client.callTool({ name: 'nex_browser_disconnect', arguments: {} })).isError
      ).not.toBe(true);
    }
    expect(active.size).toBe(0);
  } finally {
    await session.close();
  }
});

// transport 关闭必须触发一次清理，并等待幂等关闭完成。
it('releases all client sessions when the host closes its transport', async () => {
  const fetchMock = installFetchMock(
    async () => new Response('{"code":0,"data":{"sessionId":"session-1"}}')
  );
  const session = await createMcpSession(config);
  await session.client.callTool({ name: 'nex_browser_connect', arguments: { windowId: 'window' } });
  await session.client.close();
  await vi.waitFor(() =>
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1)
  );
  await session.close();
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1);
});

// 显式断开非默认连接，不应抹掉其他连接的默认值。
it('keeps the active session when disconnecting an older explicit session', async () => {
  let next = 0;
  const fetchMock = installFetchMock(
    async (_url, init) =>
      new Response(
        JSON.stringify({
          code: 0,
          data: init?.method === 'POST' ? { sessionId: `session-${++next}` } : null
        })
      )
  );
  const session = await createMcpSession(config);
  try {
    await session.client.callTool({ name: 'nex_browser_connect', arguments: { windowId: 'one' } });
    await session.client.callTool({ name: 'nex_browser_connect', arguments: { windowId: 'two' } });
    await session.client.callTool({
      name: 'nex_browser_disconnect',
      arguments: { sessionId: 'session-1' }
    });
    await session.client.callTool({ name: 'nex_browser_disconnect', arguments: {} });
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
      `${config.apiHost}/automation/sessions/session-2`
    );
  } finally {
    await session.close();
  }
});

// 宿主断开时，正在创建的工具调用应先收到取消，再释放客户端全部名额。
it('cancels an in-flight connection before transport cleanup', async () => {
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const events: string[] = [];
  installFetchMock(async (_url, init) => {
    if (init?.method === 'DELETE') {
      events.push('cleanup');
      return new Response('{"code":0,"data":null}');
    }
    return new Promise((_resolve, reject) => {
      init!.signal!.addEventListener(
        'abort',
        () => {
          events.push('cancel');
          reject(init!.signal!.reason);
        },
        { once: true }
      );
      entered();
    });
  });
  const session = await createMcpSession(config);
  const pending = session.client.callTool({
    name: 'nex_browser_connect',
    arguments: { windowId: 'window' }
  });
  const rejected = expect(pending).rejects.toThrow();
  await ready;
  await session.client.close();
  await rejected;
  await session.close();
  expect(events).toEqual(['cancel', 'cleanup']);
});
