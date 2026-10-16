import { describe, expect, it, vi } from 'vitest';
import {
  createIpTools,
  createMailTools,
  createCaptchaTools,
  createBillingTools,
  TOOLS,
  type NexApiClient
} from '../src/index.js';

const ok = (data: unknown) => ({ code: 0, msg: 'ok', data });

function setup(name: string, response: unknown) {
  const request = vi.fn().mockResolvedValue(response);
  const client = { request } as unknown as NexApiClient;
  const tools = [
    ...createIpTools(client),
    ...createMailTools(client),
    ...createCaptchaTools(client),
    ...createBillingTools(client)
  ];
  return { tool: tools.find((item) => item.name === name)!, request };
}

describe('service tool contracts', () => {
  it.each([
    ['nex_ip_product_list', {}, '/ip/products', 'GET'],
    [
      'nex_ip_buy',
      { productId: 'p', quantity: 2, duration: 30, maxTotalPrice: '0.01' },
      '/ip/buy',
      'POST'
    ],
    ['nex_ip_order_list', { page: 2 }, '/ip/orders?page=2&size=20', 'GET'],
    ['nex_ip_renew_quote', { items: [501], duration: 30 }, '/ip/renew_calc', 'POST'],
    ['nex_ip_renew', { items: [501], duration: 30, maxTotalPrice: 1 }, '/ip/renew', 'POST'],
    ['nex_ip_snap_package_list', {}, '/ip/snap/plans', 'GET'],
    ['nex_ip_snap_country_list', {}, '/ip/snap/products', 'GET'],
    ['nex_ip_snap_buy', { num: 100, maxTotalPrice: 22 }, '/ip/snap/buy', 'POST'],
    ['nex_ip_snap_pull', { nexIpId: 1, countryCode: 'US', num: 10 }, '/ip/snap/pull', 'POST'],
    ['nex_mail_plan_list', {}, '/mail/plans', 'GET'],
    ['nex_mail_domain_list', {}, '/mail/domains', 'GET'],
    [
      'nex_mail_buy',
      { type: 'MAINSTREAM', suffix: 'gmail.com', durationHours: 'DAY_1', maxTotalPrice: 1 },
      '/mail/buy',
      'POST'
    ],
    ['nex_mail_record_list', {}, '/mail/records?page=1&size=20', 'GET'],
    ['nex_mail_message_list', { id: 101 }, '/mail/pull', 'POST'],
    ['nex_mail_message_detail', { id: 101, mailId: 500 }, '/mail/detail', 'POST'],
    ['nex_captcha_product_list', {}, '/captcha/products', 'GET'],
    [
      'nex_captcha_buy',
      { productCode: 'TEST', adapter: {}, maxTotalPrice: 0.005 },
      '/captcha/buy',
      'POST'
    ],
    ['nex_captcha_record_list', {}, '/captcha/records?page=1&size=20', 'GET'],
    ['nex_captcha_query', { id: 101 }, '/captcha/query', 'POST'],
    ['nex_billing_trade_list', {}, '/billing/trades?page=1&size=20', 'GET']
  ] as const)('maps %s to the Desktop API', async (name, args, route, method) => {
    const { tool, request } = setup(name, ok(null));
    const result = await tool.execute(args);
    expect(result.isError).not.toBe(true);
    expect(request).toHaveBeenCalledExactlyOnceWith(route, expect.objectContaining({ method }));
    if (method === 'POST') expect(JSON.parse(request.mock.calls[0]![1].body)).toMatchObject(args);
  });

  it.each([
    ['nex_ip_buy', { productId: 'p', quantity: 1, duration: 30 }],
    ['nex_ip_renew', { items: [1, 1], duration: 30, maxTotalPrice: 1 }],
    ['nex_ip_snap_pull', { nexIpId: 1, countryCode: 'USA', num: 0 }],
    ['nex_mail_buy', { type: 'TEMPORARY', durationHours: 24, maxTotalPrice: 1 }],
    [
      'nex_mail_buy',
      { type: 'TEMPORARY', durationHours: 'DAY_1', prefix: 'custom', maxTotalPrice: 1 }
    ],
    [
      'nex_mail_buy',
      {
        type: 'MAINSTREAM',
        durationHours: 'DAY_1',
        suffix: 'gmail.com',
        domainId: 1,
        maxTotalPrice: 1
      }
    ],
    ['nex_mail_message_list', { id: 101, size: 10 }],
    ['nex_mail_message_detail', { id: 101, mailId: '<Message-ID>' }],
    ['nex_captcha_buy', { productCode: 'TEST', maxTotalPrice: 1 }],
    ['nex_captcha_buy', { productCode: 'TEST', adapter: null, maxTotalPrice: 1 }],
    ['nex_captcha_query', { taskId: 'upstream-id' }]
  ])('rejects invalid %s input without sending a request', (name, args) => {
    const { tool, request } = setup(name as string, ok(null));
    expect(() => tool.execute(args as any)).toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it('uses count as record count, exposes quota, and removes proxy credentials', async () => {
    const { tool } = setup(
      'nex_ip_order_list',
      ok({
        count: 42,
        total: 3,
        size: 20,
        page: 1,
        data: [
          {
            id: 1,
            productType: 'SNAP',
            state: 'PROCESSING',
            quantity: 100,
            quantitySuccess: 10,
            resources: JSON.stringify([
              { host: 'host', password: 'secret' },
              { proxyId: 900, proxy: { password: 'secret' } }
            ])
          }
        ]
      })
    );
    const result = await tool.execute({});
    expect(result.structuredContent).toMatchObject({
      count: 42,
      totalPages: 3,
      rows: [{ remaining: 90, state: 'PROCESSING' }]
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('keeps all nine email fields including complete nonnumeric keyword', async () => {
    const message = {
      id: 500,
      to: 'a@example.com',
      messageId: '<message>',
      from: 'b@example.com',
      subject: 'Verify',
      receivedAt: '2026-10-15',
      read: false,
      keyword: '00AB-CD',
      keywordDisplay: '00AB…'
    };
    const { tool } = setup('nex_mail_message_list', ok({ count: 1, total: 1, data: [message] }));
    const result = await tool.execute({ id: 101 });
    expect(result.structuredContent?.rows).toEqual([message]);
  });

  it('does not dump cached email codes in mailbox listings', async () => {
    const { tool } = setup(
      'nex_mail_record_list',
      ok({ data: [{ id: 101, message: JSON.stringify([{ keyword: 'private-code' }]) }] })
    );
    const result = await tool.execute({});
    expect(result.structuredContent?.rows).toMatchObject([{ id: 101, messageCount: 1 }]);
    expect(JSON.stringify(result)).not.toContain('private-code');
  });

  it.each(['SUCCEEDED', 'FAILED', 'EXPIRED', 'PROCESSING', 'UNKNOWN'])(
    'preserves CAPTCHA state %s and parses the solution object',
    async (state) => {
      const { tool, request } = setup(
        'nex_captcha_query',
        ok({
          id: 101,
          state,
          price: 0.005,
          solution: JSON.stringify({ text: '00AB', token: 'opaque' })
        })
      );
      const result = await tool.execute({ id: 101 });
      expect(result.structuredContent?.record).toMatchObject({
        id: 101,
        price: 0.005,
        terminal: ['SUCCEEDED', 'FAILED', 'EXPIRED'].includes(state),
        solution: { text: '00AB', token: 'opaque' }
      });
      expect(request).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    'nex_ip_buy',
    'nex_ip_renew',
    'nex_ip_snap_buy',
    'nex_ip_snap_pull',
    'nex_mail_buy',
    'nex_captcha_buy'
  ])('marks %s consequential and non-idempotent', (name) => {
    expect(TOOLS.find((tool) => tool.name === name)?.annotations).toMatchObject({
      destructiveHint: true,
      idempotentHint: false
    });
  });

  it.each(['nex_mail_message_detail', 'nex_mail_message_list', 'nex_captcha_query'])(
    'does not label %s pure read-only',
    (name) => {
      expect(TOOLS.find((tool) => tool.name === name)?.annotations?.readOnlyHint).not.toBe(true);
    }
  );

  it('does not retry or invent failure/refund on an uncertain purchase', async () => {
    const { tool, request } = setup('nex_captcha_buy', null);
    request.mockRejectedValue(new Error('timeout with confidential transport data'));
    const result = await tool.execute({ productCode: 'TEST', adapter: {}, maxTotalPrice: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('outcome is unknown');
    expect(JSON.stringify(result)).not.toContain('confidential');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('preserves backend permission failures', async () => {
    const { tool } = setup('nex_mail_message_detail', {
      code: -1005,
      msg: 'Permission denied',
      data: null
    });
    const result = await tool.execute({ id: 101, mailId: 500 });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: -1005, message: 'Permission denied' });
  });
});
