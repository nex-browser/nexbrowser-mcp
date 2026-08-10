import { describe, expect, it } from 'vitest';
import packageJson from '../package.json' with { type: 'json' };
import { MCP_SERVER_NAME, MCP_SERVER_VERSION, PKG_VERSION } from '../src/index.js';
import { createMcpSession } from './helpers.js';

/**
 * Version invariants: a mutation of version.ts must fail loudly here instead of
 * silently changing the CLI --version output or the host-visible serverInfo.
 * 版本不变量：version.ts 被改动时必须在此红灯，而不是无声改变 CLI --version 或宿主可见的 serverInfo。
 */
describe('version single-source invariants', () => {
  it('keeps PKG_VERSION in lockstep with package.json', () => {
    expect(PKG_VERSION).toBe(packageJson.version);
  });

  it('keeps serverInfo aligned with the package identity', async () => {
    expect(MCP_SERVER_VERSION).toBe(PKG_VERSION);
    expect(MCP_SERVER_NAME).toBe('nexbrowser-mcp');

    const session = await createMcpSession({
      apiHost: 'http://127.0.0.1:45536',
      apiKey: 'test-token',
      timeout: 2_000
    });
    try {
      expect(session.client.getServerVersion()).toMatchObject({
        name: MCP_SERVER_NAME,
        version: MCP_SERVER_VERSION
      });
    } finally {
      await session.close();
    }
  });
});
