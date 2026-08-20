import { describe, expect, it, vi } from 'vitest';
import { createBrowserManagementTools, type NexApiClient } from '../src/index.js';

function toolWith(name: string, data: unknown) {
  const request = vi.fn(async () => ({ code: 0, msg: 'ok', data }));
  const client = { request, getActiveSessionId: () => undefined } as unknown as NexApiClient;
  const tool = createBrowserManagementTools(client).find((candidate) => candidate.name === name)!;
  expect(tool, `Expected tool ${name} to be registered`).toBeDefined();
  return { request, tool };
}

describe('nex_browser_group_list', () => {
  it('lists groups with window counts and marks the ungrouped bucket', async () => {
    const { request, tool } = toolWith('nex_browser_group_list', [
      { id: 0, name: '未分组', seq: 0, screenCount: 4 },
      { id: 5001, name: 'Social ops', seq: 1, screenCount: 12 }
    ]);

    const result = await tool.execute({});

    expect(request).toHaveBeenLastCalledWith(
      '/group/list',
      expect.objectContaining({ method: 'GET' })
    );
    const text = String((result.content[0] as { text: string }).text);
    expect(text).toContain('GroupId 0');
    expect(text).toContain('ungrouped, not editable');
    expect(text).toContain('GroupId 5001');
    expect(text).toContain('Windows: 12');
  });
});

describe('nex_browser_group_create', () => {
  it('creates one group and reports the new groupId', async () => {
    const { request, tool } = toolWith('nex_browser_group_create', [
      { id: 5002, teamId: 2001, name: 'Ecommerce', seq: 2 }
    ]);

    const result = await tool.execute({ name: 'Ecommerce' });

    expect(request).toHaveBeenLastCalledWith(
      '/group/create',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Ecommerce' }) })
    );
    expect(String((result.content[0] as { text: string }).text)).toContain('groupId 5002');
  });

  it('forwards an explicit sort order and trims the name', async () => {
    const { request, tool } = toolWith('nex_browser_group_create', [{ id: 5003, name: 'QA' }]);

    await tool.execute({ name: '  QA  ', seq: 3 });

    expect(request).toHaveBeenLastCalledWith(
      '/group/create',
      expect.objectContaining({ body: JSON.stringify({ name: 'QA', seq: 3 }) })
    );
  });
});

describe('nex_browser_group_modify', () => {
  it('renames a custom group', async () => {
    const { request, tool } = toolWith('nex_browser_group_modify', [
      { id: 5002, name: 'Ecommerce US', seq: 2 }
    ]);

    const result = await tool.execute({ groupId: 5002, name: 'Ecommerce US' });

    expect(request).toHaveBeenLastCalledWith(
      '/group/modify',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id: 5002, name: 'Ecommerce US' })
      })
    );
    expect(String((result.content[0] as { text: string }).text)).toContain(
      'Updated window group 5002'
    );
  });

  it('accepts the documented id field', async () => {
    const { request, tool } = toolWith('nex_browser_group_modify', [{ id: 5002, seq: 4 }]);

    await tool.execute({ id: 5002, seq: 4 });

    expect(request).toHaveBeenLastCalledWith(
      '/group/modify',
      expect.objectContaining({
        body: JSON.stringify({ id: 5002, seq: 4 })
      })
    );
  });

  it('refuses to change the ungrouped bucket without calling the API', async () => {
    const { request, tool } = toolWith('nex_browser_group_modify', null);

    const result = await tool.execute({ groupId: 0, name: 'Nope' });

    expect(request).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(String((result.content[0] as { text: string }).text)).toContain('cannot be changed');
  });
});

describe('nex_browser_group_delete', () => {
  it('deletes a custom group and states that its windows survive', async () => {
    const { request, tool } = toolWith('nex_browser_group_delete', null);

    const result = await tool.execute({ groupId: 5002 });

    expect(request).toHaveBeenLastCalledWith(
      '/group/delete',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ id: 5002 }) })
    );
    const text = String((result.content[0] as { text: string }).text);
    expect(text).toContain('Deleted window group 5002');
    expect(text).toContain('ungrouped');
  });

  it('refuses to delete the ungrouped bucket without calling the API', async () => {
    const { request, tool } = toolWith('nex_browser_group_delete', null);

    const result = await tool.execute({ groupId: 0 });

    expect(request).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(String((result.content[0] as { text: string }).text)).toContain('cannot be deleted');
  });
});

describe('nex_browser_move_to_group', () => {
  it('moves multiple windows into one group', async () => {
    const { request, tool } = toolWith('nex_browser_move_to_group', {
      rows: [
        { windowId: '22', groupId: 5002, success: true },
        { windowId: '23', groupId: 5002, success: true }
      ],
      success: 2,
      failed: 0,
      total: 2
    });

    const result = await tool.execute({ windowId: ['22', '23'], groupId: 5002 });

    expect(request).toHaveBeenLastCalledWith(
      '/browser/group',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ windowIds: ['22', '23'], groupId: 5002 })
      })
    );
    expect(String((result.content[0] as { text: string }).text)).toContain('Success: 2');
  });

  it('uses groupId zero to move windows out of any group', async () => {
    const { tool } = toolWith('nex_browser_move_to_group', {
      rows: [{ windowId: '22', groupId: 0, success: true }],
      success: 1,
      failed: 0,
      total: 1
    });

    const result = await tool.execute({ windowId: '22', groupId: 0 });

    expect(String((result.content[0] as { text: string }).text)).toContain(
      'Windows moved out of any group'
    );
  });

  it('surfaces per-window failures instead of hiding them', async () => {
    const { tool } = toolWith('nex_browser_move_to_group', {
      rows: [
        { windowId: '22', groupId: 5002, success: true },
        { windowId: '23', groupId: 5002, success: false, error: 'window not found' }
      ],
      success: 1,
      failed: 1,
      total: 2
    });

    const result = await tool.execute({ windowId: ['22', '23'], groupId: 5002 });

    const text = String((result.content[0] as { text: string }).text);
    expect(text).toContain('Failed: 1');
    expect(text).toContain('Window 23: window not found');
  });
});
