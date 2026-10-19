import { describe, expect, it, vi } from 'vitest';
import { createBrowserManagementTools, type NexApiClient } from '../src/index.js';

describe('nex_browser_list runtime state', () => {
  it('reports local runtime and other-user occupancy instead of raw server flags', async () => {
    const rows = [
      { id: 1, name: 'Local', opened: 'OFF', runtimeState: 'local_running' },
      { id: 2, name: 'Stale', opened: 'ON', runtimeState: 'closed' },
      { id: 3, name: 'Other user', opened: 'ON', runtimeState: 'occupied_by_other' }
    ];
    const request = vi.fn(async () => ({ code: 0, data: { data: rows, count: 20 } }));
    const client = { request } as unknown as NexApiClient;
    const tool = createBrowserManagementTools(client).find(
      (item) => item.name === 'nex_browser_list'
    )!;

    const result = await tool.execute({ page: 2, size: 3, groupId: 0 });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Status: Running locally');
    expect(text).toContain('Status: Closed');
    expect(text).toContain('Status: Occupied by another user');
    expect(result.structuredContent).toMatchObject({ rows, total: 20, page: 2, size: 3 });
    expect(request).toHaveBeenCalledWith('/browser/list?page=2&size=3&groupId=0', {
      method: 'GET'
    });
  });

  it.each(['ON', 'OFF'])('does not infer live state from legacy opened=%s', async (opened) => {
    const request = vi.fn(async () => ({ code: 0, data: { data: [{ id: 1, opened }] } }));
    const client = { request } as unknown as NexApiClient;
    const tool = createBrowserManagementTools(client).find(
      (item) => item.name === 'nex_browser_list'
    )!;
    const result = await tool.execute({});
    expect((result.content[0] as { text: string }).text).toContain('Status: Unknown');
  });
});
