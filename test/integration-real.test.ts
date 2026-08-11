import { describe, expect, it } from 'vitest';
import { createBrowserAutomationTools, NexApiClient, resolveNexApiConfig } from '../src/index.js';

const enabled = process.env.NEX_E2E_ENABLED === '1';
const config = resolveNexApiConfig();
const client = new NexApiClient(config);
const windowId = process.env.NEX_E2E_WINDOW_ID?.trim();
const teamId = process.env.NEX_E2E_TEAM_ID?.trim();

function tool(name: string) {
  const found = createBrowserAutomationTools(client).find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Missing automation tool: ${name}`);
  return found;
}

describe.skipIf(!enabled)('real NexBrowser OpenAPI integration', () => {
  it('connects, snapshots, interacts, and disconnects through Desktop OpenAPI', async () => {
    expect(config.apiKey, 'Set NEX_API_KEY before enabling real integration tests.').not.toBe('');
    expect(windowId, 'Set NEX_E2E_WINDOW_ID to a dedicated running test window.').toBeTruthy();

    const connect = tool('nex_browser_connect');
    const snapshot = tool('nex_browser_snapshot');
    const scroll = tool('nex_browser_scroll');
    const disconnect = tool('nex_browser_disconnect');
    let connected = false;
    try {
      const connectedResult = await connect.execute({
        ...(teamId ? { teamId } : {}),
        windowId,
        startIfNeeded: false
      });
      expect(connectedResult.isError).not.toBe(true);
      connected = true;

      const snapshotResult = await snapshot.execute({});
      expect(snapshotResult.isError).not.toBe(true);
      expect(snapshotResult.content.some((item) => item.type === 'text')).toBe(true);

      // A zero-distance scroll exercises the real interaction route without
      // navigating, editing page data, or changing the test window's state.
      const interactionResult = await scroll.execute({ deltaX: 0, deltaY: 0 });
      expect(interactionResult.isError).not.toBe(true);
    } finally {
      if (connected) {
        const disconnectedResult = await disconnect.execute({});
        expect(disconnectedResult.isError).not.toBe(true);
      }
      await client.close();
    }
  });
});
