import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { vi } from 'vitest';
import { NexBrowserMcpServer, type NexApiConfig } from '../src/index.js';

/**
 * Stubs global fetch and returns the spy for assertions; the stub is not
 * self-restoring, so callers must call vi.unstubAllGlobals() in afterEach.
 * 替换全局 fetch 并返回用于断言的 spy；该替换不会自动还原，
 * 调用方必须在 afterEach 中执行 vi.unstubAllGlobals()。
 */
export function installFetchMock(implementation: typeof fetch) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/**
 * Creates a connected in-memory MCP session without a child process.
 * 无需启动子进程即可创建已连接的内存 MCP 会话。
 */
export async function createMcpSession(config: NexApiConfig) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = new NexBrowserMcpServer(config);
  const client = new Client(
    { name: 'nexbrowser-test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    client,
    async close() {
      // allSettled: a teardown failure on either side must not mask the test outcome.
      // 使用 allSettled：任一侧的清理失败都不应掩盖测试本身的结果。
      await Promise.allSettled([server.close(), client.close()]);
    }
  };
}
