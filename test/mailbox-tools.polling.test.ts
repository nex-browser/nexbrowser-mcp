import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMailboxTools, type NexApiClient } from '../src/index.js';

const ACCOUNT_ID = '7b0f5a52-5f33-4c4b-9a52-3d7cb2a2c1aa';
const ok = (rows: unknown[]) => ({
  code: 0,
  msg: 'ok',
  data: { account: { id: ACCOUNT_ID, error: '' }, rows, count: rows.length, page: 1, size: 50 }
});
const message = (id: string, receivedAt = '2026-11-25T12:00:01Z') => ({ id, receivedAt });

/** 只构造消息列表工具，按队列返回本地 OpenAPI 响应。 */
function fixture(...responses: unknown[]) {
  const queue = [...responses];
  const request = vi.fn(async (_route: string, _options?: RequestInit) => queue.shift() ?? ok([]));
  const tool = createMailboxTools({ request } as unknown as NexApiClient).find(
    (row) => row.name === 'nex_mailbox_message_list'
  )!;
  return { request, tool };
}
afterEach(() => vi.useRealTimers());

describe('mail service message polling', () => {
  it('syncs once by default and keeps local polling fields out of the request', async () => {
    const { tool, request } = fixture(ok([message('a'.repeat(64))]));
    const result = await tool.execute({ accountId: ACCOUNT_ID });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent?.rows).toHaveLength(1);
    expect(request).toHaveBeenCalledExactlyOnceWith('/mailbox/messages', {
      method: 'POST',
      body: JSON.stringify({ accountId: ACCOUNT_ID, page: 1, sync: true })
    });
  });

  it('waits for mail received after the send time and reports completion', async () => {
    vi.useFakeTimers();
    const old = message('b'.repeat(64), '2026-11-25T11:00:00Z');
    const fresh = message('c'.repeat(64), '2026-11-25T12:05:00Z');
    const { tool, request } = fixture(ok([old]), ok([fresh, old]));
    const pending = tool.execute({
      accountId: ACCOUNT_ID,
      waitSeconds: 180,
      receivedAfter: '2026-11-25T12:00:00Z'
    });
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.structuredContent).toMatchObject({
      rows: [fresh],
      recovery: { resourceType: 'mailbox', action: 'COMPLETE' }
    });
  });

  it('returns a replaceable timeout when no matching mail arrives', async () => {
    vi.useFakeTimers();
    const { tool } = fixture();
    const pending = tool.execute({ accountId: ACCOUNT_ID, waitSeconds: 15 });
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await pending;
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: 'MAILBOX_MESSAGE_TIMEOUT',
      recovery: { resourceType: 'mailbox', action: 'REPLACE_RESOURCE' }
    });
  });
});
