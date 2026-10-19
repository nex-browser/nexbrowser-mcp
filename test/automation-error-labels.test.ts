import { describe, expect, it, vi } from 'vitest';
import { createBrowserAutomationTools, type NexApiClient } from '../src/index.js';

/** Builds automation tools whose every request fails with the given server envelope. */
function failingTool(toolName: string, failure: { code: number | string; msg: string }) {
  const request = vi.fn(async () => failure);
  const client = { request, getActiveSessionId: () => 'session-1' } as unknown as NexApiClient;
  return createBrowserAutomationTools(client).find((candidate) => candidate.name === toolName)!;
}

function textOf(result: Awaited<ReturnType<ReturnType<typeof failingTool>['execute']>>): string {
  return result.content.map((item) => (item.type === 'text' ? item.text : '')).join('\n');
}

describe('automation error labels', () => {
  // Regression: failures were prefixed with the success label, e.g. "Screenshot captured.: ...".
  it('prefixes a failed action with the action name instead of its success label', async () => {
    const result = await failingTool('nex_browser_take_screenshot', {
      code: 'INVALID_ARGUMENT',
      msg: 'page.evaluate failed'
    }).execute({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Browser action screenshot failed: page.evaluate failed');
    expect(textOf(result)).not.toContain('Screenshot captured');
  });

  it('labels a failed click as a failure and keeps the recovery hint', async () => {
    const result = await failingTool('nex_browser_click', {
      code: 'ACTION_TIMEOUT',
      msg: 'locator.click: Timeout 15000ms exceeded.'
    }).execute({ target: 'e12' });

    expect(textOf(result)).toMatch(/^Browser action click failed: locator\.click/);
    expect(textOf(result)).not.toContain('Element clicked');
    expect(textOf(result)).toContain('nex_browser_wait_for');
  });

  it('uses the failure label for session and tab endpoints', async () => {
    const connect = await failingTool('nex_browser_connect', {
      code: 'WINDOW_NOT_FOUND',
      msg: 'missing'
    }).execute({ windowId: '1' });
    const tabs = await failingTool('nex_browser_tab_list', { code: 1, msg: 'gone' }).execute({});

    expect(textOf(connect)).toMatch(/^Failed to connect browser automation session: missing/);
    expect(textOf(connect)).not.toContain('session connected');
    expect(textOf(tabs)).toMatch(/^Failed to list browser tabs: gone/);
  });
});
