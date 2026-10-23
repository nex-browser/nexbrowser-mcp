import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMailTools, type NexApiClient } from '../src/index.js';

const ok = (data: unknown, contextId = 'team-a') => ({ code: 0, msg: 'ok', data, contextId });
const page = (rows: unknown[]) => ({ data: rows, count: rows.length, total: 1, page: 1 });
const mail = (id: number, receivedAt = '2026-10-23T12:00:01Z') => ({
  id,
  receivedAt,
  keyword: '001234',
  to: 'task@example.com'
});
function fixture(...responses: unknown[]) {
  const queue = [...responses];
  const request = vi.fn(
    async (_route: string, _options?: RequestInit) => queue.shift() ?? ok(page([]))
  );
  const tool = createMailTools({ request } as unknown as NexApiClient).find(
    (row) => row.name === 'nex_mail_message_list'
  )!;
  return { request, tool };
}
afterEach(() => vi.useRealTimers());

describe('mail verification polling', () => {
  it('keeps the default one-sync behavior and does not forward local polling fields', async () => {
    const { tool, request } = fixture(ok(page([])));
    const result = await tool.execute({ id: 101 });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent?.rows).toEqual([]);
    expect(request).toHaveBeenCalledExactlyOnceWith('/mail/pull', {
      method: 'POST',
      body: JSON.stringify({ id: 101, page: 1 })
    });
  });

  it('pins polling to one context and returns a newly received email', async () => {
    vi.useFakeTimers();
    const { tool, request } = fixture(ok(page([])), ok(page([mail(1)])));
    const pending = tool.execute({ id: 101, waitSeconds: 180 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).structuredContent).toMatchObject({
      rows: [mail(1)],
      recovery: { action: 'COMPLETE', resourceType: 'mail', resourceId: 101 }
    });
    expect(request).toHaveBeenLastCalledWith(
      '/mail/pull',
      expect.objectContaining({
        headers: { 'X-Nex-Service-Context': 'team-a' },
        body: JSON.stringify({ id: 101, page: 1 })
      })
    );
  });

  it('ignores the first-sync baseline only when onlyNew is explicitly requested', async () => {
    vi.useFakeTimers();
    const { tool } = fixture(ok(page([mail(1)])), ok(page([mail(2), mail(1)])));
    const pending = tool.execute({ id: 101, waitSeconds: 180, onlyNew: true });
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).structuredContent?.rows).toEqual([mail(2)]);
  });

  it('filters old email by the current send timestamp locally', async () => {
    vi.useFakeTimers();
    const old = mail(1, '2026-10-23T11:59:59Z');
    const { tool, request } = fixture(ok(page([old])), ok(page([mail(2), old])));
    const pending = tool.execute({
      id: 101,
      waitSeconds: 180,
      receivedAfter: '2026-10-23T12:00:00Z'
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).structuredContent?.rows).toEqual([mail(2)]);
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({ id: 101, page: 1 });
  });

  it('marks a confirmed empty wait as replacement-eligible rather than a purchase timeout', async () => {
    vi.useFakeTimers();
    const { tool, request } = fixture();
    const pending = tool.execute({ id: 101, waitSeconds: 180 });
    await vi.advanceTimersByTimeAsync(180_000);
    expect((await pending).structuredContent).toMatchObject({
      code: 'MAIL_MESSAGE_TIMEOUT',
      purchaseOutcomeKnown: true,
      recovery: {
        action: 'REPLACE_RESOURCE',
        resourceType: 'mail',
        resourceId: 101,
        maxAttempts: 3
      }
    });
    expect(request.mock.calls.every(([route]) => route === '/mail/pull')).toBe(true);
  });

  it('stops on a context change without buying a replacement', async () => {
    vi.useFakeTimers();
    const { tool, request } = fixture(ok(page([])), ok(page([mail(1)]), 'team-b'));
    const pending = tool.execute({ id: 101, waitSeconds: 180 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).structuredContent).toMatchObject({ code: 'SESSION_CONTEXT_CHANGED' });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not interpret a sync transport error as an empty verification wait', async () => {
    const { tool, request } = fixture();
    request.mockRejectedValueOnce(new Error('private network detail'));
    const result = await tool.execute({ id: 101, waitSeconds: 180 });
    expect(result.structuredContent).toMatchObject({
      code: 'MAIL_SYNC_FAILED',
      recovery: { action: 'STOP', retryable: false }
    });
    expect(JSON.stringify(result)).not.toContain('private network detail');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('cancels during the polling delay without another request', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const { tool, request } = fixture();
    const pending = tool.execute({ id: 101, waitSeconds: 180 }, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
