import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOOLS } from '../src/index.js';
import { createMcpSession, installFetchMock } from './helpers.js';

const config = { apiHost: 'http://127.0.0.1:45536', apiKey: 'test-token', timeout: 2_000 };

afterEach(() => vi.unstubAllGlobals());

describe('NexCaptcha routing for external hosts', () => {
  it('prefers agent-driven CAPTCHA integration while retaining NexBrowser routing, payment and permissions', async () => {
    const session = await createMcpSession(config);
    try {
      const instructions = session.client.getInstructions()!;
      expect(instructions).toContain(
        'When using nexbrowser-mcp for browser tasks, use NexBrowser environments by default.'
      );
      expect(instructions).toContain('nex_browser_connect(windowId, startIfNeeded=true)');
      expect(instructions).not.toMatch(/follow-up.*resources from nex_mail_\*/i);
      expect(instructions).toContain('nex_captcha_detect');
      expect(instructions).toContain('nex_captcha_apply_result');
      expect(instructions).toContain('canApply defaults false and grants no permission');
      expect(instructions).toMatch(/do not bypass disabled evaluate\/runCode permissions/i);
      expect(instructions).toMatch(/raw CDP to evade them/i);
      expect(instructions).toContain('nex_browser_captcha_prepare');
      expect(instructions).toMatch(/charge directly without a quotation or payment confirmation/i);
      expect(instructions).toMatch(/inquiry alone never authorizes a purchase/i);
      expect(instructions).toMatch(/fixed Desktop bridge is optional/i);
      expect(instructions).toMatch(/undeclared s value/i);
      expect(instructions).not.toMatch(/never bypass prepare with raw nex_captcha_buy/i);
    } finally {
      await session.close();
    }
  });

  it('publishes free detection and the optional fixed bridge even with lazy tool discovery', async () => {
    const session = await createMcpSession(config);
    try {
      const { tools } = await session.client.listTools();
      for (const name of [
        'nex_browser_connect',
        'nex_browser_navigate',
        'nex_browser_reload',
        'nex_browser_snapshot',
        'nex_browser_get_text',
        'nex_browser_take_screenshot',
        'nex_browser_evaluate',
        'nex_browser_run_code',
        'nex_browser_drag',
        'nex_browser_mouse_click_xy',
        'nex_browser_click'
      ]) {
        const tool = tools.find((item) => item.name === name)!;
        expect(tool.description, name).toContain('nex_captcha_detect');
        expect(tool.description, name).toContain('nex_browser_captcha_prepare');
        expect(tool.description, name).toMatch(/free/i);
        expect(tool.description, name).toMatch(/never bypass browser permissions/i);
        expect(TOOLS.find((item) => item.name === name)?.description).toBe(tool.description);
      }
      expect(tools.find((item) => item.name === 'nex_browser_evaluate')?.description).toContain(
        'permission'
      );
      expect(tools.find((item) => item.name === 'nex_browser_connect')?.description).toContain(
        'For nexbrowser-mcp browser tasks, use a NexBrowser environment by default'
      );
    } finally {
      await session.close();
    }
  });

  it('returns the CAPTCHA route on connection without preparing or purchasing automatically', async () => {
    const fetchMock = installFetchMock(
      async () =>
        new Response(
          JSON.stringify({
            code: 0,
            data: { sessionId: 's1', pageId: 'p1' }
          })
        )
    );
    const session = await createMcpSession(config);
    try {
      const result = await session.client.callTool({
        name: 'nex_browser_connect',
        arguments: { windowId: 'w1' }
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual({ data: { sessionId: 's1', pageId: 'p1' } });
      expect(result.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('nex_captcha_detect')
          })
        ])
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${config.apiHost}/automation/sessions`);
    } finally {
      await session.close();
    }
  });

  it('keeps normal JavaScript inspection and screenshot images available', async () => {
    const fetchMock = installFetchMock(async (_url, init) => {
      const { action } = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          code: 0,
          data:
            action === 'evaluate'
              ? { result: 'Page title' }
              : { artifacts: [{ mimeType: 'image/png', base64: 'aGVsbG8=' }] }
        })
      );
    });
    const session = await createMcpSession(config);
    try {
      const evaluated = await session.client.callTool({
        name: 'nex_browser_evaluate',
        arguments: { sessionId: 's1', expression: 'document.title' }
      });
      expect(evaluated.structuredContent).toEqual({ data: { result: 'Page title' } });
      const screenshot = await session.client.callTool({
        name: 'nex_browser_take_screenshot',
        arguments: { sessionId: 's1' }
      });
      expect(screenshot.content).toContainEqual({
        type: 'image',
        data: 'aGVsbG8=',
        mimeType: 'image/png'
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls.every(([url]) => String(url).endsWith('/actions'))).toBe(true);
    } finally {
      await session.close();
    }
  });
});
