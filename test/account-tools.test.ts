import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserAutomationTools,
  createBrowserManagementTools,
  type NexApiClient
} from '../src/index.js';

function toolWith(name: string, data: unknown) {
  const request = vi.fn(async () => ({ code: 0, msg: 'ok', data }));
  const client = { request, getActiveSessionId: () => 'session-1' } as unknown as NexApiClient;
  const tool = [
    ...createBrowserManagementTools(client),
    ...createBrowserAutomationTools(client)
  ].find((candidate) => candidate.name === name)!;
  expect(tool, `Expected tool ${name} to be registered`).toBeDefined();
  return { request, tool };
}

const ACCOUNT_ROWS = [
  {
    windowId: '22448',
    windowName: '环境-51163',
    success: true,
    accounts: [
      {
        accountId: '55',
        platformId: '',
        platformName: 'x.com',
        platformUrl: 'https://x.com/',
        username: 'oz*********14',
        remark: '',
        hasPassword: true,
        has2fa: true
      }
    ]
  }
];

describe('nex_browser_accounts', () => {
  it('reads bound accounts for the requested windows', async () => {
    const { request, tool } = toolWith('nex_browser_accounts', ACCOUNT_ROWS);
    const result = await tool.execute({ windowId: ['22448', '22449'] });

    expect(request).toHaveBeenLastCalledWith(
      '/browser/accounts?windowId=22448%2C22449',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect(String((result.content[0] as { text: string }).text)).toContain('accountId 55');
  });

  it('reports windows without any bound account instead of returning an empty result', async () => {
    const { tool } = toolWith('nex_browser_accounts', [
      { windowId: '22448', windowName: 'Solo', success: true, accounts: [] }
    ]);
    const result = await tool.execute({ windowId: '22448' });

    expect(String((result.content[0] as { text: string }).text)).toContain(
      'No platform account is bound'
    );
  });

  it('rejects a missing windowId locally', async () => {
    const { request, tool } = toolWith('nex_browser_accounts', ACCOUNT_ROWS);
    const result = await tool.execute({ windowId: [] });

    expect(result.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('nex_browser_fill_account', () => {
  it('sends only field targets, never a credential value', async () => {
    const { request, tool } = toolWith('nex_browser_fill_account', {
      windowId: '22448',
      accountId: '55',
      platformName: 'x.com',
      username: 'oz*********14',
      filled: ['username', 'password'],
      submitted: false
    });
    await tool.execute({
      accountId: 55,
      usernameTarget: 'e12',
      passwordTarget: 'e13'
    });

    expect(request).toHaveBeenLastCalledWith(
      '/automation/sessions/session-1/account_fill',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          accountId: '55',
          usernameTarget: 'e12',
          passwordTarget: 'e13'
        })
      })
    );
  });

  it('requires at least one visible field target before calling Desktop', async () => {
    const { request, tool } = toolWith('nex_browser_fill_account', {});
    const result = await tool.execute({ accountId: '55' });

    expect(result.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps credentials out of the result text and structured content', async () => {
    const { tool } = toolWith('nex_browser_fill_account', {
      windowId: '22448',
      accountId: '55',
      platformName: 'x.com',
      username: 'oz*********14',
      filled: ['username', 'password', 'totp'],
      submitted: false
    });
    const result = await tool.execute({
      usernameTarget: 'e12',
      passwordTarget: 'e13',
      totpTarget: 'e14'
    });

    expect(JSON.stringify(result)).not.toContain('wKFWmqcbfq');
    expect(String((result.content[0] as { text: string }).text)).toContain('was not submitted');
  });
});

describe('nex_browser_fill_credentials', () => {
  it('recommends stored-account filling when a bound account is available', () => {
    const { tool } = toolWith('nex_browser_fill_credentials', {});

    expect(tool.description).toContain('nex_browser_fill_account');
  });

  it('fills literal credentials in order and redacts them from its result', async () => {
    const request = vi.fn(async () => ({
      code: 0,
      msg: 'alice@example.com secret-password 123456',
      data: { value: 'alice@example.com secret-password 123456' }
    }));
    const client = { request, getActiveSessionId: () => 'session-1' } as unknown as NexApiClient;
    const tool = createBrowserAutomationTools(client).find(
      (candidate) => candidate.name === 'nex_browser_fill_credentials'
    )!;

    const result = await tool.execute({
      pageId: 'page-1',
      usernameTarget: 'e12',
      username: 'alice@example.com',
      passwordTarget: 'e13',
      password: 'secret-password',
      totpTarget: 'e14',
      totpCode: '123456'
    });

    expect(request).toHaveBeenNthCalledWith(
      1,
      '/automation/sessions/session-1/actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          action: 'fill',
          pageId: 'page-1',
          params: { target: 'e12', value: 'alice@example.com' }
        })
      })
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/automation/sessions/session-1/actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          action: 'fill',
          pageId: 'page-1',
          params: { target: 'e13', value: 'secret-password' }
        })
      })
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      '/automation/sessions/session-1/actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          action: 'fill',
          pageId: 'page-1',
          params: { target: 'e14', value: '123456' }
        })
      })
    );
    expect(request).toHaveBeenCalledTimes(3);
    expect(result.structuredContent).toEqual({
      filled: ['username', 'password', '2FA code'],
      submitted: false
    });
    expect(String((result.content[0] as { text: string }).text)).toContain(
      'The form was not submitted.'
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('alice@example.com');
    expect(serialized).not.toContain('secret-password');
    expect(serialized).not.toContain('123456');
  });

  it.each([
    {},
    { username: 'alice@example.com' },
    { usernameTarget: 'e12' },
    { password: 'secret-password' },
    { passwordTarget: 'e13' },
    { totpCode: '123456' },
    { totpTarget: 'e14' }
  ])('rejects invalid credential arguments locally without calling the API', async (args) => {
    const { request, tool } = toolWith('nex_browser_fill_credentials', {});

    const result = await tool.execute(args);

    expect(result.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('treats an explicitly supplied empty string as a credential value', async () => {
    const { request, tool } = toolWith('nex_browser_fill_credentials', {});

    const result = await tool.execute({ usernameTarget: 'e12', username: '' });

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      '/automation/sessions/session-1/actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          action: 'fill',
          params: { target: 'e12', value: '' }
        })
      })
    );
    expect(result.structuredContent).toEqual({ filled: ['username'], submitted: false });
  });

  it('stops after a failed password fill and redacts its secret', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, msg: 'ok', data: {} })
      .mockResolvedValueOnce({
        code: 'ACTION_TIMEOUT',
        msg: 'secret-password',
        data: { value: 'secret-password' }
      });
    const client = { request, getActiveSessionId: () => 'session-1' } as unknown as NexApiClient;
    const tool = createBrowserAutomationTools(client).find(
      (candidate) => candidate.name === 'nex_browser_fill_credentials'
    )!;

    const result = await tool.execute({
      usernameTarget: 'e12',
      username: 'alice@example.com',
      passwordTarget: 'e13',
      password: 'secret-password',
      totpTarget: 'e14',
      totpCode: '123456'
    });

    expect(request).toHaveBeenCalledTimes(2);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ code: 'ACTION_TIMEOUT', field: 'password' });
    expect(String((result.content[0] as { text: string }).text)).toContain(
      'Failed to fill password.'
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('alice@example.com');
    expect(serialized).not.toContain('secret-password');
    expect(serialized).not.toContain('123456');
  });
});

describe('nex_browser_create', () => {
  it('forwards a normalized count with the caller overrides', async () => {
    const { request, tool } = toolWith('nex_browser_create', {
      rows: [{ seq: 1, name: 'TikTok-01', success: true, id: '22448' }],
      success: 1,
      failed: 0,
      total: 1
    });
    const result = await tool.execute({ name: 'TikTok', count: 1, accountIds: [61] });

    expect(request).toHaveBeenLastCalledWith(
      '/browser/create',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'TikTok', count: 1, accountIds: [61] })
      })
    );
    expect(String((result.content[0] as { text: string }).text)).toContain('windowId 22448');
  });

  it('rejects a batch larger than the desktop create-window cap', () => {
    const { request, tool } = toolWith('nex_browser_create', {});
    // schema 校验在 execute 之前同步抛出，Desktop 收不到超额批量请求。
    expect(() => tool.execute({ count: 51 })).toThrow(/50/);
    expect(request).not.toHaveBeenCalled();
  });

  it('surfaces per-window failures alongside the successes', async () => {
    const { tool } = toolWith('nex_browser_create', {
      rows: [
        { seq: 1, name: 'Batch-01', success: true, id: '1' },
        { seq: 2, name: 'Batch-02', success: false, error: 'window quota exhausted' }
      ],
      success: 1,
      failed: 1,
      total: 2
    });
    const text = String(
      (
        (await tool.execute({ name: 'Batch', count: 2 })).content[0] as {
          text: string;
        }
      ).text
    );

    expect(text).toContain('Created 1 of 2');
    expect(text).toContain('window quota exhausted');
  });
});
