import { describe, expect, it, vi } from 'vitest';
import { createBrowserManagementTools, type NexApiClient } from '../src/index.js';

function toolWith(name: string, data: unknown) {
  const request = vi.fn(async () => ({ code: 0, msg: 'ok', data }));
  const client = { request, getActiveSessionId: () => undefined } as unknown as NexApiClient;
  const tool = createBrowserManagementTools(client).find((candidate) => candidate.name === name)!;
  expect(tool, `Expected tool ${name} to be registered`).toBeDefined();
  return { request, tool };
}

describe('nex_account_list', () => {
  it('lists catalog accounts without secrets', async () => {
    const { request, tool } = toolWith('nex_account_list', {
      data: [
        {
          id: 55,
          platformUrl: 'https://www.tiktok.com',
          platformName: 'TikTok',
          username: 'ops@example.com',
          password: 'do-not-expose',
          key2fa: 'JBSWY3DPEHPK3PXP',
          remark: 'US team',
          bindScreen: [{ id: 22 }]
        }
      ],
      count: 1
    });

    const result = await tool.execute({ keyword: 'tiktok' });

    expect(request).toHaveBeenLastCalledWith(
      '/account/list?page=1&size=100&keyword=tiktok',
      expect.objectContaining({ method: 'GET' })
    );
    const payload = JSON.stringify(result);
    expect(payload).toContain('AccountId 55');
    expect(payload).toContain('ops@example.com');
    expect(payload).toContain('https://www.tiktok.com');
    expect(payload).not.toContain('do-not-expose');
    expect(payload).not.toContain('JBSWY3DPEHPK3PXP');
  });
});

describe('nex_account_create', () => {
  it('creates a catalog account and strips secrets from the result', async () => {
    const { request, tool } = toolWith('nex_account_create', [
      {
        id: 56,
        platformUrl: 'https://x.com',
        platformName: 'X',
        username: 'ops@example.com',
        password: 'do-not-expose',
        key2fa: 'JBSWY3DPEHPK3PXP'
      }
    ]);

    const result = await tool.execute({
      platformUrl: 'https://x.com',
      platformName: 'X',
      username: 'ops@example.com',
      password: 'do-not-expose',
      key2fa: 'JBSWY3DPEHPK3PXP'
    });

    expect(request).toHaveBeenLastCalledWith(
      '/account/create',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          platformUrl: 'https://x.com',
          platformName: 'X',
          username: 'ops@example.com',
          password: 'do-not-expose',
          key2fa: 'JBSWY3DPEHPK3PXP'
        })
      })
    );
    const payload = JSON.stringify(result);
    expect(payload).toContain('accountId 56');
    expect(payload).not.toContain('do-not-expose');
    expect(payload).not.toContain('JBSWY3DPEHPK3PXP');
  });
});

describe('nex_account_modify', () => {
  it('updates an account and omits blank secrets from the request', async () => {
    const { request, tool } = toolWith('nex_account_modify', [{ id: 56, username: 'new@example.com' }]);

    const result = await tool.execute({
      accountId: 56,
      username: 'new@example.com',
      password: '',
      key2fa: ''
    });

    expect(request).toHaveBeenLastCalledWith(
      '/account/modify',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id: 56, username: 'new@example.com' })
      })
    );
    expect(String((result.content[0] as { text: string }).text)).toContain(
      'Updated platform account 56'
    );
  });
});

describe('nex_browser_bind_account', () => {
  it('binds catalog accounts to multiple closed windows', async () => {
    const { request, tool } = toolWith('nex_browser_bind_account', null);

    const result = await tool.execute({ windowId: ['22', '23'], accountIds: [55, 56] });

    expect(request).toHaveBeenLastCalledWith(
      '/browser/account',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ windowIds: ['22', '23'], accountIds: [55, 56] })
      })
    );
    expect(String((result.content[0] as { text: string }).text)).toContain(
      'Bound 2 platform account'
    );
  });

  it('uses an empty accountIds list to remove a binding', async () => {
    const { tool } = toolWith('nex_browser_bind_account', null);

    const result = await tool.execute({ windowId: '22', accountIds: [] });

    expect(String((result.content[0] as { text: string }).text)).toContain(
      'Platform account binding removed'
    );
  });
});

describe('nex_account_delete', () => {
  it('deletes multiple catalog accounts', async () => {
    const { request, tool } = toolWith('nex_account_delete', null);

    const result = await tool.execute({ accountId: [55, 56] });

    expect(request).toHaveBeenLastCalledWith(
      '/account/delete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ items: [55, 56] })
      })
    );
    expect(String((result.content[0] as { text: string }).text)).toContain(
      'Deleted 2 platform account'
    );
  });

  it('accepts the documented items alias', async () => {
    const { request, tool } = toolWith('nex_account_delete', null);

    await tool.execute({ items: [55] });

    expect(request).toHaveBeenLastCalledWith(
      '/account/delete',
      expect.objectContaining({
        body: JSON.stringify({ items: [55] })
      })
    );
  });
});

describe('nex_account_batch_create', () => {
  it('creates several catalog accounts and strips secrets', async () => {
    const { request, tool } = toolWith('nex_account_batch_create', [
      { id: 56, platformUrl: 'https://x.com', username: 'a', password: 'do-not-expose' },
      { id: 57, platformUrl: 'https://www.tiktok.com', username: 'b', key2fa: 'JBSWY3DPEHPK3PXP' }
    ]);

    const result = await tool.execute({
      items: [
        { platformUrl: 'https://x.com', username: 'a', password: 'do-not-expose' },
        { platformUrl: 'https://www.tiktok.com', username: 'b', key2fa: 'JBSWY3DPEHPK3PXP' }
      ]
    });

    expect(request).toHaveBeenLastCalledWith(
      '/account/batch_create',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          items: [
            { platformUrl: 'https://x.com', username: 'a', password: 'do-not-expose' },
            { platformUrl: 'https://www.tiktok.com', username: 'b', key2fa: 'JBSWY3DPEHPK3PXP' }
          ]
        })
      })
    );
    const payload = JSON.stringify(result);
    expect(payload).toContain('Created 2 platform account');
    expect(payload).not.toContain('do-not-expose');
    expect(payload).not.toContain('JBSWY3DPEHPK3PXP');
  });
});

describe('nex_account_modify aliases', () => {
  it('accepts the documented id field', async () => {
    const { request, tool } = toolWith('nex_account_modify', [{ id: 56 }]);

    await tool.execute({ id: 56, remark: 'ops' });

    expect(request).toHaveBeenLastCalledWith(
      '/account/modify',
      expect.objectContaining({
        body: JSON.stringify({ id: 56, remark: 'ops' })
      })
    );
  });
});

describe('nex_browser_bind_account aliases', () => {
  it('accepts documented windowIds', async () => {
    const { request, tool } = toolWith('nex_browser_bind_account', {
      rows: [{ windowId: '22', accountIds: [55], success: true }],
      success: 1,
      failed: 0,
      total: 1
    });

    await tool.execute({ windowIds: '22', accountIds: [55] });

    expect(request).toHaveBeenLastCalledWith(
      '/browser/account',
      expect.objectContaining({
        body: JSON.stringify({ windowIds: ['22'], accountIds: [55] })
      })
    );
  });
});
