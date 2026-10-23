import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOOLS } from '../src/index.js';
import { createMcpSession, installFetchMock, onlineCaptchaContract } from './helpers.js';

const config = {
  apiHost: 'http://127.0.0.1:45536',
  apiKey: 'test-token',
  timeout: 2_000
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NexBrowser MCP protocol', () => {
  it('reads online CAPTCHA contracts through the SDK and requires an exact product code', async () => {
    const contract = onlineCaptchaContract('GEETEST_V4');
    const fetchMock = installFetchMock(
      async () => new Response(JSON.stringify({ code: 0, data: contract }))
    );
    const session = await createMcpSession(config);
    try {
      const listed = await session.client.listTools();
      const schema = listed.tools.find((tool) => tool.name === 'nex_captcha_product_schema')!;
      expect(schema.annotations?.readOnlyHint).toBe(true);
      expect(schema.inputSchema.required).toEqual(['productCode']);
      const detail = await session.client.callTool({
        name: 'nex_captcha_product_schema',
        arguments: { productCode: 'GEETEST_V4' }
      });
      expect(detail.isError).not.toBe(true);
      expect(detail.structuredContent).toEqual(contract);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:45536/captcha/schema',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ productCode: 'GEETEST_V4' })
        })
      );
    } finally {
      await session.close();
    }
  });
  it('propagates an MCP cancellation into the in-flight service HTTP request', async () => {
    let started!: () => void, cancelled!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const stopped = new Promise<void>((resolve) => {
      cancelled = resolve;
    });
    const fetchMock = installFetchMock(async (url, init) => {
      if (String(url).endsWith('/captcha/schema'))
        return new Response(
          JSON.stringify({ code: 0, contextId: 'team-a', data: onlineCaptchaContract('TEST') })
        );
      if (!String(url).endsWith('/captcha/buy')) return new Response('{"code":0,"data":null}');
      started();
      return new Promise((_resolve, reject) => {
        init!.signal!.addEventListener(
          'abort',
          () => {
            cancelled();
            reject(init!.signal!.reason);
          },
          { once: true }
        );
      });
    });
    const session = await createMcpSession(config);
    const controller = new AbortController();
    try {
      const pending = session.client.callTool(
        {
          name: 'nex_captcha_buy',
          arguments: { productCode: 'TEST', adapter: {} }
        },
        undefined,
        { signal: controller.signal }
      );
      const rejected = expect(pending).rejects.toThrow();
      await ready;
      controller.abort();
      await rejected;
      await stopped;
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/captcha/buy'))
      ).toHaveLength(1);
    } finally {
      await session.close();
    }
  });
  it('publishes usable mailbox purchase properties through SDK tools/list', async () => {
    const session = await createMcpSession(config);
    try {
      const listed = await session.client.listTools();
      const buy = listed.tools.find((tool) => tool.name === 'nex_mail_buy')!;
      expect(Object.keys(buy.inputSchema.properties ?? {})).toEqual([
        'type',
        'durationHours',
        'domainId',
        'suffix'
      ]);
      expect(buy.inputSchema.required).toEqual(['type', 'durationHours']);
    } finally {
      await session.close();
    }
  });
  it.each([
    ['nex_ip_buy', { productId: 'p1', quantity: 1, duration: 30 }, '/ip/buy'],
    ['nex_mail_buy', { type: 'TEMPORARY', durationHours: 'DAY_1' }, '/mail/buy'],
    [
      'nex_mail_buy',
      { type: 'MAINSTREAM', suffix: 'gmail.com', durationHours: 'DAY_1' },
      '/mail/buy'
    ],
    ['nex_captcha_query', { id: 101 }, '/captcha/query']
  ])(
    'executes %s through SDK schema validation and authenticated transport',
    async (name, args, path) => {
      const fetchMock = installFetchMock(
        async () =>
          new Response(
            JSON.stringify({ code: 0, msg: 'ok', data: { id: 101, state: 'PROCESSING' } })
          )
      );
      const session = await createMcpSession(config);
      try {
        const result = await session.client.callTool({
          name: name as string,
          arguments: args as Record<string, unknown>
        });
        expect(result.isError).not.toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
          `http://127.0.0.1:45536${path}`,
          expect.objectContaining({ method: 'POST' })
        );
        expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual(args);
      } finally {
        await session.close();
      }
    }
  );

  it('publishes routing guidance that distinguishes NexBrowser environments from OS windows', async () => {
    const session = await createMcpSession(config);

    try {
      expect(session.client.getInstructions()).toMatch(
        /never substitute the Browser plugin, Chrome plugin, computer-use/i
      );
      expect(session.client.getInstructions()).toContain(
        "'使用 NexBrowser 查看我有多少窗口' means call nex_browser_list"
      );
      const listed = await session.client.listTools();
      expect(listed.tools.find((tool) => tool.name === 'nex_browser_list')?.description).toMatch(
        /Preferred NexBrowser OpenAPI tool/i
      );
      expect(listed.tools.find((tool) => tool.name === 'nex_browser_list')?.description).toMatch(
        /Never reports Chrome, Edge, the Codex in-app browser/i
      );
      expect(listed.tools.filter((tool) => tool.name === 'nex_browser_list')).toHaveLength(1);
    } finally {
      await session.close();
    }
  });

  // Reuse owned resources before directly buying a needed signup resource.
  it('guides sign-ups to owned mailboxes and numbers, then a direct purchase', async () => {
    const session = await createMcpSession(config);

    try {
      const instructions = session.client.getInstructions()!;
      expect(instructions).toMatch(/sign-up.*email address or phone number.*nex_mail_record_list/i);
      expect(instructions).toMatch(/obtain the needed NexMail mailbox or NexSMS number directly/i);
      expect(instructions).toContain('do not ask for a separate price confirmation');
      expect(instructions).toContain('inquiry alone never authorizes a purchase');
      expect(instructions).toMatch(/refs from the latest nex_browser_snapshot/);
    } finally {
      await session.close();
    }
  });

  it('lists unified tools and forwards a management call to OpenAPI', async () => {
    const fetchMock = installFetchMock(
      async () => new Response(JSON.stringify({ code: 0, msg: 'ok', data: { data: [], count: 0 } }))
    );
    const session = await createMcpSession(config);

    try {
      const listed = await session.client.listTools();
      const names = listed.tools.map((tool) => tool.name);
      expect(names).toHaveLength(96);
      expect(
        names.every(
          (name) =>
            name.startsWith('nex_browser_') ||
            name.startsWith('nex_proxy_') ||
            name.startsWith('nex_account_') ||
            name.startsWith('nex_sms_') ||
            name.startsWith('nex_ip_') ||
            name.startsWith('nex_mail_') ||
            name.startsWith('nex_captcha_') ||
            name.startsWith('nex_billing_')
        )
      ).toBe(true);
      expect(names).not.toEqual(
        expect.arrayContaining([
          'nexbrowser_list_windows',
          'nex_list_browsers',
          'nex_open_browsers',
          'browser_snapshot'
        ])
      );
      expect(names).toEqual(
        expect.arrayContaining([
          'nex_browser_list',
          'nex_browser_connect',
          'nex_browser_snapshot',
          'nex_browser_fill_credentials'
        ])
      );

      const result = await session.client.callTool({
        name: 'nex_browser_list',
        arguments: { teamId: 'team-1' }
      });
      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('NexBrowser managed windows/environments')
          })
        ])
      );
      // The preferred branded tool forwards to the NexBrowser OpenAPI window-list endpoint.
      // 首选品牌化工具转发到 NexBrowser OpenAPI 的环境列表端点。
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:45536/browser/list?page=1&size=100&teamId=team-1',
        expect.objectContaining({ method: 'GET' })
      );
    } finally {
      await session.close();
    }
  });

  it('validates tool arguments before invoking the OpenAPI client', async () => {
    const fetchMock = installFetchMock(
      async () => new Response(JSON.stringify({ code: 0, msg: 'ok', data: {} }))
    );
    const session = await createMcpSession(config);

    try {
      const result = await session.client.callTool({
        name: 'nex_browser_resize',
        arguments: { width: 0, height: 720 }
      });

      expect(result.isError).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await session.close();
    }
  });

  it('maps locally detectable argument failures to structured INVALID_ARGUMENT', async () => {
    const fetchMock = installFetchMock(
      async () => new Response(JSON.stringify({ code: 0, msg: 'ok', data: {} }))
    );
    const session = await createMcpSession(config);

    try {
      // No sessionId argument and no active session for this client.
      // 未传 sessionId 且该客户端没有活动会话。
      const result = await session.client.callTool({ name: 'nex_browser_tab_list', arguments: {} });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ code: 'INVALID_ARGUMENT' });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await session.close();
    }
  });

  it('exports Zod schemas as standard JSON Schema for host previews', () => {
    const resizeTool = TOOLS.find((tool) => tool.name === 'nex_browser_resize');
    const connectTool = TOOLS.find((tool) => tool.name === 'nex_browser_connect');

    expect(resizeTool?.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        width: { type: 'number', minimum: 1, maximum: 10_000 },
        height: { type: 'number', minimum: 1, maximum: 10_000 }
      },
      required: ['width', 'height'],
      additionalProperties: false
    });
    expect(connectTool?.inputSchema).toMatchObject({
      type: 'object',
      required: ['windowId']
    });
  });
});
