import { describe, expect, it, vi } from 'vitest';
import { createBrowserAutomationTools, type NexApiClient } from '../src/index.js';

function tabsClient(toolName: 'nex_browser_tab_select' | 'nex_browser_tab_close') {
  const request = vi.fn(async () => ({ code: 0, msg: 'ok', data: { done: true } }));
  const client = { request, getActiveSessionId: () => 'session-1' } as unknown as NexApiClient;
  const tool = createBrowserAutomationTools(client).find(
    (candidate) => candidate.name === toolName
  )!;
  return { request, tool };
}

describe('tab operations', () => {
  it('selects a tab by stable page ID', async () => {
    const { request, tool } = tabsClient('nex_browser_tab_select');
    await tool.execute({ pageId: 'page-first' });

    expect(request).toHaveBeenLastCalledWith(
      '/ai/browser/sessions/session-1/tabs/select',
      expect.objectContaining({ body: JSON.stringify({ pageId: 'page-first' }) })
    );
  });

  it('closes a tab by stable page ID', async () => {
    const { request, tool } = tabsClient('nex_browser_tab_close');
    await tool.execute({ pageId: 'page-last' });

    expect(request).toHaveBeenLastCalledWith(
      '/ai/browser/sessions/session-1/tabs/close',
      expect.objectContaining({ body: JSON.stringify({ pageId: 'page-last' }) })
    );
  });
});
