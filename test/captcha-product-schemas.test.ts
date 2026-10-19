import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOOLS, createCaptchaTools, type NexApiClient } from '../src/index.js';
import { createMcpSession, installFetchMock, onlineCaptchaContract } from './helpers.js';

afterEach(() => vi.unstubAllGlobals());

/** 模拟服务端契约及本地任务接口，所有付费调用均止于 mock。 */
function fixture(productCode = 'FUTURE_PRODUCT') {
  const contract = onlineCaptchaContract(productCode);
  const request = vi.fn(async (route: string, _options?: RequestInit) => ({
    code: 0,
    msg: 'ok',
    contextId: 'team-a',
    data: route === '/captcha/schema' ? contract : { id: 7, productCode, state: 'CREATED' }
  }));
  const tools = createCaptchaTools({ request } as unknown as NexApiClient);
  const buy = (adapter: Record<string, unknown> = {}) =>
    tools
      .find((tool) => tool.name === 'nex_captcha_buy')!
      .execute({ productCode, adapter, maxTotalPrice: '0.005' });
  const purchases = () => request.mock.calls.filter(([route]) => route === '/captcha/buy');
  return { contract, request, tools, buy, purchases };
}

describe('online NexCaptcha contracts', () => {
  it('publishes required exact product codes and no frozen product conditions', () => {
    const schema = TOOLS.find((tool) => tool.name === 'nex_captcha_product_schema')!.inputSchema;
    expect(schema.required).toEqual(['productCode']);
    const buy = TOOLS.find((tool) => tool.name === 'nex_captcha_buy')!.inputSchema;
    expect(buy).not.toHaveProperty('allOf');
    expect(buy.properties).toHaveProperty('adapter');
  });

  it('returns complete online constraints and unknown fields through real MCP text and structured content', async () => {
    const contract = {
      ...onlineCaptchaContract('ALTCHA'),
      schema: {
        type: 'object',
        oneOf: [{ required: ['challengeURL'] }, { required: ['challengeJSON'] }],
        additionalProperties: true
      },
      futureGuide: { version: 2 }
    };
    const request = installFetchMock(
      async () => new Response(JSON.stringify({ code: 0, data: contract }))
    );
    const session = await createMcpSession({
      apiHost: 'http://127.0.0.1:45536',
      apiKey: 'test',
      timeout: 2_000
    });
    try {
      const result = await session.client.callTool({
        name: 'nex_captcha_product_schema',
        arguments: { productCode: 'ALTCHA' }
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual(contract);
      expect(result.content).toContainEqual({ type: 'text', text: JSON.stringify(contract) });
      expect(request).toHaveBeenCalledWith(
        'http://127.0.0.1:45536/captcha/schema',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ productCode: 'ALTCHA' }) })
      );
    } finally {
      await session.close();
    }
  });

  it.each(['RECAPTCHA_V2_ENTERPRISE', 'TURNSTILE', ' mixed_Code '])(
    'preserves %s verbatim without local aliases',
    async (productCode) => {
      const f = fixture(productCode);
      await f.tools
        .find((tool) => tool.name === 'nex_captcha_product_schema')!
        .execute({ productCode });
      expect(f.request.mock.calls[0]).toEqual([
        '/captcha/schema',
        { method: 'POST', body: JSON.stringify({ productCode }) }
      ]);
    }
  );

  it.each([{}, { productCode: '' }, { productCode: '  ' }])(
    'rejects missing product codes before requests: %j',
    (args) => {
      const f = fixture();
      expect(() =>
        f.tools.find((tool) => tool.name === 'nex_captcha_product_schema')!.execute(args)
      ).toThrow();
      expect(f.request).not.toHaveBeenCalled();
    }
  );

  it('accepts new fields immediately after online schema changes without restarting or reusing a cached $id', async () => {
    const f = fixture('RECAPTCHA_V2_ENTERPRISE');
    f.contract.schema = { type: 'object', additionalProperties: false };
    expect((await f.buy({ newField: false })).isError).toBe(true);
    expect(f.purchases()).toHaveLength(0);
    Object.assign(f.contract.schema, {
      properties: { newField: { type: 'boolean' } },
      required: ['newField'],
      $id: 'https://schema.test/current'
    });
    expect((await f.buy({ newField: false })).isError).not.toBe(true);
    Object.assign(f.contract.schema, { properties: { newField: { type: 'string' } } });
    expect((await f.buy({ newField: false })).isError).toBe(true);
    expect(f.purchases()).toHaveLength(1);
    expect(f.purchases()[0]).toEqual([
      '/captcha/buy',
      expect.objectContaining({
        headers: { 'X-Nex-Service-Context': 'team-a' },
        body: JSON.stringify({
          productCode: 'RECAPTCHA_V2_ENTERPRISE',
          adapter: { newField: false },
          maxTotalPrice: '0.005'
        })
      })
    ]);
  });

  it('enforces online oneOf and additionalProperties without rewriting input', async () => {
    const f = fixture();
    Object.assign(f.contract.schema, {
      properties: { left: { type: 'string' }, right: { type: 'string' } },
      additionalProperties: false,
      oneOf: [{ required: ['left'] }, { required: ['right'] }]
    });
    for (const adapter of [{}, { left: 'x', right: 'y' }, { left: 'x', extra: true }])
      expect((await f.buy(adapter)).isError).toBe(true);
    expect(f.purchases()).toHaveLength(0);
    expect((await f.buy({ right: 'x' })).isError).not.toBe(true);
    expect(f.purchases()).toHaveLength(1);
  });

  it.each(['DOCUMENTATION_REQUIRED', 'missing', 'malformed', 'unavailable', 'network', 'context'])(
    'stops before payment for %s online contracts',
    async (failure) => {
      const f = fixture();
      if (failure === 'DOCUMENTATION_REQUIRED') f.contract.integration.readiness = failure;
      if (failure === 'missing') delete (f.contract as any).integration.resultSchema;
      if (failure === 'malformed') f.contract.schema = { type: 'invalid-type' };
      if (failure === 'unavailable')
        f.request.mockResolvedValue({
          code: -1200,
          msg: 'Localized upstream error',
          contextId: 'team-a',
          data: null
        } as any);
      if (failure === 'network')
        f.request.mockRejectedValue(new Error('private transport details'));
      if (failure === 'context') f.request.mockResolvedValue({ code: 0, data: f.contract } as any);
      const result = await f.buy();
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain('No purchase attempted');
      expect(JSON.stringify(result)).not.toContain('private transport details');
      expect(f.purchases()).toHaveLength(0);
      expect(f.request).toHaveBeenCalledTimes(1);
    }
  );

  it('returns server schema errors without substituting local documentation', async () => {
    const f = fixture();
    f.request.mockResolvedValue({ code: 'DOWNSTREAM_ERROR', msg: '产品不存在', data: null } as any);
    const result = await f.tools
      .find((tool) => tool.name === 'nex_captcha_product_schema')!
      .execute({ productCode: 'FUTURE_PRODUCT' });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: 'DOWNSTREAM_ERROR',
      message: '产品不存在'
    });
    expect(f.request).toHaveBeenCalledTimes(1);
  });

  it.each(['apiKey', 'API_KEY', 'clientKey'])(
    'retains generic %s protection without product field rules',
    (key) => {
      const f = fixture();
      expect(() => f.buy({ [key]: 'private-key' })).toThrow(/Platform API keys/);
      expect(f.request).not.toHaveBeenCalled();
    }
  );

  it('never retries a purchase after a lost response', async () => {
    const f = fixture();
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (route, options) => {
      if (route === '/captcha/buy') throw new Error('lost response');
      return original(route, options);
    });
    const result = await f.buy();
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('outcome is unknown');
    expect(f.purchases()).toHaveLength(1);
  });

  it('keeps challenge media and credentials out of ordinary task summaries', async () => {
    const f = fixture();
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (route, options) =>
      route === '/captcha/schema'
        ? original(route, options)
        : ({
            code: 0,
            msg: 'ok',
            contextId: 'team-a',
            data: {
              id: 7,
              state: 'CREATED',
              adapter: { body: 'private-image', proxyPassword: 'private-password' },
              request: 'private-request'
            }
          } as any)
    );
    expect(JSON.stringify(await f.buy())).not.toMatch(
      /private-image|private-password|private-request/
    );
  });
});
