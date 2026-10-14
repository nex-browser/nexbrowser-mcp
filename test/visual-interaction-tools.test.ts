import { describe, expect, it, vi } from 'vitest';
import { createBrowserAutomationTools, type NexApiClient } from '../src/index.js';

/** 使用受控响应检查 MCP 参数透传与图片产物。 */
function toolsForResponse(data: Record<string, unknown> = { result: { clicked: true } }) {
  const request = vi.fn(async () => ({ code: 0, msg: 'ok', data }));
  const client = { request, getActiveSessionId: () => 'session-1' } as unknown as NexApiClient;
  const tools = createBrowserAutomationTools(client);
  return { request, tool: (name: string) => tools.find((item) => item.name === name)! };
}

describe('visual interaction tools', () => {
  it('keeps screenshot geometry alongside MCP image content', async () => {
    const geometry = {
      origin: { x: 100, y: 200 },
      pixelsPerCssPixel: 1,
      coordinateSystem: 'viewport-css'
    };
    const base64 = Buffer.from('image-bytes').toString('base64');
    const { tool } = toolsForResponse({
      result: geometry,
      artifacts: [{ base64, mimeType: 'image/png' }]
    });
    const result = await tool('nex_browser_take_screenshot').execute({});
    expect(result.content).toContainEqual({ type: 'image', data: base64, mimeType: 'image/png' });
    expect(result.structuredContent).toMatchObject({ data: { result: geometry } });
  });
  it('forwards a fractional viewport coordinate and an explicit popup page', async () => {
    const { request, tool } = toolsForResponse();
    await tool('nex_browser_mouse_click_xy').execute({
      pageId: 'popup-page',
      x: 120.5,
      y: 80,
      button: 'right',
      clickCount: 2,
      delay: 100
    });
    expect(request).toHaveBeenCalledWith(
      '/automation/sessions/session-1/actions',
      expect.objectContaining({
        body: JSON.stringify({
          action: 'click',
          pageId: 'popup-page',
          params: { x: 120.5, y: 80, button: 'right', clickCount: 2, delay: 100 }
        })
      })
    );
  });

  it.each([
    { x: -1, y: 0 },
    { x: 0 },
    { x: Infinity, y: 0 },
    { x: 0, y: 0, clickCount: 1.5 },
    { x: 0, y: 0, delay: -1 }
  ])('rejects invalid coordinate input before transport: %j', async (args) => {
    const { request, tool } = toolsForResponse();
    expect(() => tool('nex_browser_mouse_click_xy').execute(args)).toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it('forwards an element screenshot with explicit device scale', async () => {
    const { request, tool } = toolsForResponse();
    await tool('nex_browser_take_screenshot').execute({
      target: '#grid',
      scale: 'device',
      type: 'jpeg',
      quality: 70
    });
    expect(request).toHaveBeenCalledWith(
      '/automation/sessions/session-1/actions',
      expect.objectContaining({
        body: JSON.stringify({
          action: 'screenshot',
          params: { target: '#grid', scale: 'device', type: 'jpeg', quality: 70 }
        })
      })
    );
  });

  it('forwards a viewport crop without silently dropping geometry', async () => {
    const { request, tool } = toolsForResponse();
    const clip = { x: 100, y: 50, width: 400, height: 400 };
    await tool('nex_browser_take_screenshot').execute({ clip });
    expect(request).toHaveBeenCalledWith(
      '/automation/sessions/session-1/actions',
      expect.objectContaining({
        body: JSON.stringify({ action: 'screenshot', params: { clip } })
      })
    );
  });

  it.each([
    { clip: { x: 0, y: 0, width: 0, height: 10 } },
    { clip: { x: -1, y: 0, width: 10, height: 10 } },
    { clip: { x: 0, y: 0, width: 10, height: Infinity } }
  ])('rejects malformed crop rectangles: %j', async (args) => {
    const { request, tool } = toolsForResponse();
    expect(() => tool('nex_browser_take_screenshot').execute(args)).toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
