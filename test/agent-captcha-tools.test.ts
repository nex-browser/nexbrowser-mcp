import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCaptchaTools } from '../src/features/captcha/captcha-tools.js';
import type { NexApiClient } from '../src/transport/nex-api-client.js';
import { onlineCaptchaContract } from './helpers.js';

const url = 'https://site.test/login?step=2';
const websiteKey = 'actual-site-key';
const productCode = 'RECAPTCHA_V2_ENTERPRISE';

/** 对照线上 Nex 字段集，不把第三方 enterprisePayload 当成默认支持的参数。 */
function liveEnterpriseSchema(): Record<string, any> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['websiteURL', 'websiteKey'],
    properties: {
      websiteURL: { type: 'string' },
      websiteKey: { type: 'string' },
      isInvisible: { type: 'boolean' },
      minScore: { type: 'number' },
      apiDomain: { type: 'string' },
      pageAction: { type: 'string' },
      isEnterprise: { type: 'boolean' },
      userAgent: { type: 'string' }
    }
  };
}

function pageHtml(s?: string, id = 'captcha') {
  return `<form><input name="password" value="never-forward-this"><div id="${id}" class="g-recaptcha" data-sitekey="${websiteKey}"${s ? ` data-s="${s}"` : ''}>
    <iframe src="https://www.google.com/recaptcha/enterprise/anchor?k=${websiteKey}&amp;size=normal"></iframe>
    <textarea name="g-recaptcha-response"></textarea></div></form>`;
}

/** 只连接已有 Nex 服务路由，模拟账单上下文及本地记录；不会发出真实付费调用。 */
function fixture() {
  const contract = { ...onlineCaptchaContract(productCode), schema: liveEnterpriseSchema() };
  Object.assign(contract.integration.resultSchema, {
    type: 'object',
    properties: { token: { type: 'string' }, gRecaptchaResponse: { type: 'string' } }
  });
  const products: any[] = [{ productCode, price: '0.003' }];
  const record: Record<string, any> = { id: 41, productCode, state: 'PROCESSING', solution: {} };
  let contextId = 'team-a';
  let purchaseContext: string | undefined = contextId;
  let queryContext = contextId;
  let purchaseThrows = false;
  let queryCode: string | number = 0;
  const request = vi.fn(async (path: string, options?: RequestInit): Promise<any> => {
    const body = options?.body ? JSON.parse(String(options.body)) : undefined;
    if (path === '/captcha/products') return { code: 0, contextId, data: products };
    if (path === '/captcha/schema') {
      expect(body).toEqual({ productCode: contract.productCode });
      return { code: 0, contextId, data: contract };
    }
    if (path === '/captcha/buy') {
      if (purchaseThrows) throw new Error('Connection lost after send');
      return { code: 0, contextId: purchaseContext, data: { ...record, state: 'CREATED' } };
    }
    if (path === '/captcha/query')
      return {
        code: queryCode,
        msg: 'Query unavailable',
        contextId: queryContext,
        data: { ...record }
      };
    throw new Error(`Unexpected route: ${path}`);
  });
  const client = { request } as unknown as NexApiClient;
  const tools = createCaptchaTools(client);
  const call = async (name: string, args: Record<string, unknown>) =>
    tools.find((tool) => tool.name === `nex_captcha_${name}`)!.execute(args);
  const adapter = { websiteURL: url, websiteKey, isInvisible: false, isEnterprise: true };
  const detect = (args: Record<string, unknown> = {}) =>
    call('detect', { url, html: pageHtml(), canApply: true, ...args });
  const buy = (args: Record<string, unknown> = {}) =>
    call('buy', { productCode, adapter, workflow: 'BROWSER_RESULT', ...args });
  const apply = (args: Record<string, unknown> = {}) =>
    call('apply_result', { id: 41, url, websiteKey, ...args });
  const buys = () => request.mock.calls.filter(([path]) => path === '/captcha/buy');
  const queries = () => request.mock.calls.filter(([path]) => path === '/captcha/query');
  return {
    contract,
    products,
    record,
    request,
    client,
    adapter,
    call,
    detect,
    buy,
    apply,
    buys,
    queries,
    setContext: (value: string) => {
      contextId = value;
    },
    setPurchaseContext: (value: string | undefined) => {
      purchaseContext = value;
    },
    setQueryContext: (value: string) => {
      queryContext = value;
    },
    throwPurchase: () => {
      purchaseThrows = true;
    },
    failQuery: () => {
      queryCode = 'QUERY_UNAVAILABLE';
    }
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('agent-driven CAPTCHA detection and existing Nex payment', () => {
  it('does not suggest a purchase when the live result kind is unsupported by the helper', async () => {
    const f = fixture();
    f.contract.integration.resultKind = 'COOKIE';
    const detected = (await f.detect()).structuredContent as any;
    expect(detected.candidates[0]).toMatchObject({
      ready: false,
      reason: expect.stringContaining('not TOKEN')
    });
    expect(detected.candidates[0]).not.toHaveProperty('purchase');
    expect(f.buys()).toHaveLength(0);
  });

  it('retains the purchased enterprise challenge in the generated page binding', async () => {
    const f = fixture();
    Object.assign(f.contract.schema.properties, {
      enterprisePayload: { type: 'object', properties: { s: { type: 'string' } } }
    });
    await f.buy({ adapter: { ...f.adapter, enterprisePayload: { s: 'purchased-challenge-s' } } });
    Object.assign(f.record, { state: 'SUCCEEDED', solution: { token: 'result-token' } });
    const result = (await f.apply()).structuredContent as any;
    expect(result.apply.javascript).toContain('"challenge":{"s":"purchased-challenge-s"}');
    expect(f.buys()).toHaveLength(1);
  });

  it('detects current HTML for free and returns exact Nex buy arguments with the online contract', async () => {
    const f = fixture();
    const result = await f.detect();
    expect(result.isError).not.toBe(true);
    const data = result.structuredContent as any;
    expect(data).toMatchObject({
      detected: true,
      ready: true,
      purchaseAttempted: false,
      applicationVerifiedByServer: false
    });
    expect(data.candidates).toHaveLength(1);
    expect(data.candidates[0]).toMatchObject({
      productCode,
      selector: '[id="captcha"]',
      onlineContract: f.contract,
      purchase: {
        tool: 'nex_captcha_buy',
        arguments: { productCode, adapter: f.adapter, workflow: 'BROWSER_RESULT' }
      }
    });
    expect(f.buys()).toHaveLength(0);
    expect(f.request.mock.calls.map(([path]) => path)).toEqual([
      '/captcha/products',
      '/captcha/schema'
    ]);
    expect(JSON.stringify(f.request.mock.calls)).not.toContain('never-forward-this');
  });

  it('does not assume an agent can apply JavaScript unless canApply is supplied', async () => {
    const f = fixture();
    const result = await f.call('detect', { url, html: pageHtml() });
    expect(result.structuredContent).toMatchObject({
      ready: false,
      purchaseAttempted: false,
      candidates: [{ ready: false, reason: expect.stringContaining('application capability') }]
    });
    expect((result.structuredContent as any).candidates[0]).not.toHaveProperty('purchase');
    expect(f.buys()).toHaveLength(0);
  });

  it('blocks observed s under the actual Nex enterprise contract instead of deleting the observation', async () => {
    const f = fixture();
    const result = await f.detect({ html: pageHtml('fresh-observed-s') });
    expect(result.structuredContent).toMatchObject({
      ready: false,
      candidates: [
        {
          ready: false,
          unsupportedObservations: ['s'],
          reason: expect.stringContaining('Do not omit')
        }
      ]
    });
    expect((result.structuredContent as any).candidates[0]).not.toHaveProperty('purchase');
    expect(f.buys()).toHaveLength(0);
  });

  it('uses enterprisePayload.s only when a current provider-compatible contract declares it', async () => {
    const f = fixture();
    f.contract.schema.properties.enterprisePayload = {
      type: 'object',
      properties: { s: { type: 'string' } },
      required: ['s'],
      additionalProperties: false
    };
    const result = await f.detect({ html: pageHtml('fresh-observed-s') });
    expect(result.structuredContent).toMatchObject({
      ready: true,
      candidates: [
        {
          ready: true,
          adapter: { enterprisePayload: { s: 'fresh-observed-s' } },
          unsupportedObservations: []
        }
      ]
    });
    expect(f.buys()).toHaveLength(0);
  });

  it('requires widget selection when several initialized widgets appear in the HTML', async () => {
    const f = fixture();
    const result = await f.detect({
      html: pageHtml(undefined, 'first') + pageHtml(undefined, 'second')
    });
    expect(result.structuredContent).toMatchObject({ ready: false });
    expect((result.structuredContent as any).candidates).toHaveLength(2);
    expect((result.structuredContent as any).candidates.map((row: any) => row.selector)).toEqual([
      '[id="first"]',
      '[id="second"]'
    ]);
    expect(f.buys()).toHaveLength(0);
  });

  it.each(['s', 'size', 'action', 'enterprise'])(
    'rejects runtime overrides that replace observed %s parameters',
    async (field) => {
      const f = fixture();
      f.contract.schema.properties.enterprisePayload = {
        type: 'object',
        properties: { s: { type: 'string' } },
        required: ['s'],
        additionalProperties: false
      };
      const adapter =
        field === 's'
          ? { enterprisePayload: { s: 'old-challenge' } }
          : field === 'size'
            ? { isInvisible: true }
            : field === 'action'
              ? { pageAction: 'different-action' }
              : { isEnterprise: false };
      const html =
        field === 'action'
          ? pageHtml().replace('class="g-recaptcha"', 'class="g-recaptcha" data-action="login"')
          : pageHtml(field === 's' ? 'fresh-challenge' : undefined);
      const result = await f.detect({ html, adapter });
      expect(result.structuredContent).toMatchObject({
        ready: false,
        candidates: [{ ready: false, reason: expect.stringContaining('conflict') }]
      });
      expect((result.structuredContent as any).candidates[0]).not.toHaveProperty('purchase');
      expect(f.buys()).toHaveLength(0);
    }
  );

  it('does not substitute a standard product when the observed enterprise product is disabled', async () => {
    const f = fixture();
    f.products[0].productCode = 'RECAPTCHA_V2';
    expect((await f.detect()).structuredContent).toMatchObject({
      ready: false,
      candidates: [{ productCode, ready: false, reason: expect.stringContaining('not enabled') }]
    });
    expect(f.request.mock.calls.map(([path]) => path)).toEqual(['/captcha/products']);
  });

  it.each([true, false])(
    'prefers exact Turnstile products and uses the legacy alias only when necessary: exact=%s',
    async (exact) => {
      const f = fixture();
      const expected = exact ? 'CLOUDFLARE_TURNSTILE' : 'TURNSTILE';
      f.contract.productCode = expected;
      f.products.splice(
        0,
        f.products.length,
        { productCode: 'TURNSTILE', price: '0.004' },
        ...(exact ? [{ productCode: 'CLOUDFLARE_TURNSTILE', price: '0.003' }] : [])
      );
      const result = await f.detect({
        html: `<div class="cf-turnstile" data-sitekey="${websiteKey}"><input name="cf-turnstile-response"></div>`
      });
      expect(result.structuredContent).toMatchObject({
        ready: true,
        candidates: [{ productCode: expected, purchase: { arguments: { productCode: expected } } }]
      });
      expect(f.buys()).toHaveLength(0);
    }
  );

  it.each([true, false])(
    'preserves an explicitly selected Turnstile alias regardless of catalog order: legacyFirst=%s',
    async (legacyFirst) => {
      const f = fixture();
      f.contract.productCode = 'TURNSTILE';
      const products = [{ productCode: 'TURNSTILE' }, { productCode: 'CLOUDFLARE_TURNSTILE' }];
      f.products.splice(0, f.products.length, ...(legacyFirst ? products : products.reverse()));
      const result = await f.detect({
        productCode: 'TURNSTILE',
        html: `<div class="cf-turnstile" data-sitekey="${websiteKey}"></div>`
      });
      expect(result.structuredContent).toMatchObject({
        ready: true,
        candidates: [
          { productCode: 'TURNSTILE', purchase: { arguments: { productCode: 'TURNSTILE' } } }
        ]
      });
      expect(f.buys()).toHaveLength(0);
    }
  );

  it.each(['TURNSTILE', 'CLOUDFLARE_TURNSTILE'])(
    'does not alias an explicitly selected disabled product: %s',
    async (selected) => {
      const f = fixture();
      const other = selected === 'TURNSTILE' ? 'CLOUDFLARE_TURNSTILE' : 'TURNSTILE';
      f.products.splice(0, f.products.length, { productCode: other });
      const result = await f.detect({
        productCode: selected,
        html: `<div class="cf-turnstile" data-sitekey="${websiteKey}"></div>`
      });
      expect(result.structuredContent).toMatchObject({
        ready: false,
        candidates: [{ ready: false, reason: expect.stringContaining('not enabled') }]
      });
      expect(f.request.mock.calls.map(([path]) => path)).toEqual(['/captcha/products']);
    }
  );

  it('blocks HTTP-only contracts both during detection and a BROWSER_RESULT purchase', async () => {
    const f = fixture();
    f.contract.integration.workflows = ['HTTP_SUBMIT'];
    expect((await f.detect()).structuredContent).toMatchObject({
      ready: false,
      candidates: [{ reason: expect.stringContaining('BROWSER_RESULT') }]
    });
    expect((await f.buy()).structuredContent).toMatchObject({
      purchaseAttempted: false,
      code: 'CAPTCHA_PREFLIGHT_FAILED'
    });
    expect(f.buys()).toHaveLength(0);
  });

  it.each([
    { url: 'file:///private' },
    { url: 'https://name:secret@site.test/' },
    { html: '' },
    { html: 'x'.repeat(1_000_001) },
    { adapter: { apiKey: 'never-forward' } },
    { canApply: 'yes' },
    { unknown: true }
  ])('rejects invalid detect inputs before any service call', async (args) => {
    const f = fixture();
    await expect(f.detect(args)).rejects.toThrow();
    expect(f.request).not.toHaveBeenCalled();
  });

  it('rejects mismatched actual runtime URL or sitekey before suggesting payment', async () => {
    const f = fixture();
    const result = await f.detect({
      adapter: { websiteURL: 'https://other.test/', websiteKey: 'other-key' }
    });
    expect(result.structuredContent).toMatchObject({
      ready: false,
      candidates: [{ reason: expect.stringContaining('do not match') }]
    });
  });

  it('pays through the existing Nex endpoint and never forwards workflow or page HTML as provider input', async () => {
    const f = fixture();
    const detected = (await f.detect()).structuredContent as any;
    const result = await f.call('buy', detected.candidates[0].purchase.arguments);
    expect(result.structuredContent).toMatchObject({ record: { id: 41, productCode } });
    expect(f.buys()).toHaveLength(1);
    const options = f.buys()[0]![1]!;
    expect(new Headers(options.headers).get('X-Nex-Service-Context')).toBe('team-a');
    expect(JSON.parse(String(options.body))).toEqual({ productCode, adapter: f.adapter });
    expect(JSON.stringify(options)).not.toContain('workflow');
    expect(JSON.stringify(options)).not.toContain('never-forward-this');
  });
});

describe('agent CAPTCHA application result for an existing paid record', () => {
  it('returns a token application expression only after a successful matching Nex task', async () => {
    const f = fixture();
    await f.buy();
    Object.assign(f.record, {
      state: 'SUCCEEDED',
      solution: { gRecaptchaResponse: 'real-solver-token' }
    });
    const result = await f.apply({ selector: '[id="captcha"]' });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      id: 41,
      state: 'SUCCEEDED',
      websiteVerified: false,
      purchaseAttempted: false,
      apply: { javascript: expect.stringContaining('real-solver-token') }
    });
    expect(f.buys()).toHaveLength(1);
    expect(f.queries()).toHaveLength(1);
    expect(new Headers(f.queries()[0]![1]!.headers).get('X-Nex-Service-Context')).toBe('team-a');
    expect(JSON.parse(String(f.queries()[0]![1]!.body))).toEqual({ id: 41 });
  });

  it('accepts only fragment differences in the original URL binding', async () => {
    const f = fixture();
    await f.buy();
    f.record.state = 'SUCCEEDED';
    f.record.solution = { token: 'token' };
    expect((await f.apply({ url: `${url}#fragment` })).structuredContent).toHaveProperty(
      'apply.javascript'
    );
    expect(f.buys()).toHaveLength(1);
  });

  it.each([{ id: 999 }, { url: 'https://other.test/' }, { websiteKey: 'other-key' }])(
    'rejects a missing or mismatched purchase binding without querying or repurchasing',
    async (args) => {
      const f = fixture();
      await f.buy();
      const result = await f.apply(args);
      expect(result.structuredContent).toMatchObject({
        code: 'CAPTCHA_BINDING_REQUIRED',
        purchaseAttempted: false
      });
      expect(result.structuredContent ?? {}).not.toHaveProperty('apply');
      expect(f.queries()).toHaveLength(0);
      expect(f.buys()).toHaveLength(1);
    }
  );

  it('does not recover a purchase binding in another MCP process/client', async () => {
    const f = fixture();
    await f.buy();
    const fresh = fixture();
    expect((await fresh.apply()).structuredContent).toMatchObject({
      code: 'CAPTCHA_BINDING_REQUIRED'
    });
    expect(fresh.request).not.toHaveBeenCalled();
  });

  it('expires application bindings rather than buying a replacement task', async () => {
    const f = fixture();
    await f.buy();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 300_001);
    expect((await f.apply()).structuredContent).toMatchObject({ code: 'CAPTCHA_BINDING_REQUIRED' });
    expect(f.queries()).toHaveLength(0);
    expect(f.buys()).toHaveLength(1);
  });

  it('throttles repeated pending queries without an application script or new payment', async () => {
    const f = fixture();
    await f.buy();
    const first = await f.apply();
    expect(first.structuredContent).toMatchObject({
      state: 'PROCESSING',
      retryAfterMs: 3_000,
      purchaseAttempted: false
    });
    expect(first.structuredContent).not.toHaveProperty('apply');
    const second = await f.apply();
    expect(second.structuredContent).toMatchObject({
      state: 'POLL_LATER',
      purchaseAttempted: false
    });
    expect(f.queries()).toHaveLength(1);
    expect(f.buys()).toHaveLength(1);
  });

  it.each(['FAILED', 'EXPIRED', 'CREATED', 'SUBMITTING', 'UNRECOGNIZED_STATE'])(
    'returns no application script for %s',
    async (state) => {
      const f = fixture();
      await f.buy();
      f.record.state = state;
      const result = await f.apply();
      expect(result.structuredContent).toMatchObject({ state, purchaseAttempted: false });
      expect(result.structuredContent ?? {}).not.toHaveProperty('apply');
      if (['FAILED', 'EXPIRED'].includes(state))
        expect((result.structuredContent as any).guidance).toContain('refund');
      expect(f.buys()).toHaveLength(1);
    }
  );

  it.each([{ id: 42 }, { productCode: 'RECAPTCHA_V2' }])(
    'rejects mismatched record identity or product',
    async (change) => {
      const f = fixture();
      await f.buy();
      Object.assign(f.record, { state: 'SUCCEEDED', solution: { token: 'token' } }, change);
      const result = await f.apply();
      expect(result.isError).toBe(true);
      expect(result.structuredContent ?? {}).not.toHaveProperty('apply');
      expect(f.buys()).toHaveLength(1);
    }
  );

  it('blocks a changed identity/team context before querying the record', async () => {
    const f = fixture();
    await f.buy();
    f.setContext('other-team');
    await expect(f.apply()).rejects.toThrow('context changed');
    expect(f.queries()).toHaveLength(0);
    expect(f.buys()).toHaveLength(1);
  });

  it('rejects a record returned under a different identity/team context', async () => {
    const f = fixture();
    await f.buy();
    f.setQueryContext('other-team');
    f.record.state = 'SUCCEEDED';
    f.record.solution = { token: 'token' };
    expect((await f.apply()).isError).toBe(true);
    expect(f.buys()).toHaveLength(1);
  });

  it.each([
    {},
    { token: '' },
    { token: 123 },
    { token: 'one', gRecaptchaResponse: 'two' },
    '{not json}'
  ])(
    'does not generate code from malformed or ambiguous successful token data',
    async (solution) => {
      const f = fixture();
      await f.buy();
      Object.assign(f.record, { state: 'SUCCEEDED', solution });
      const result = await f.apply();
      expect(result.isError).toBe(true);
      expect(result.structuredContent ?? {}).not.toHaveProperty('apply');
      expect(f.buys()).toHaveLength(1);
    }
  );

  it('requires a documented TOKEN result and preserves online workflow constraints', async () => {
    const f = fixture();
    await f.buy();
    f.contract.integration.resultKind = 'GRID_CELLS';
    expect((await f.apply()).isError).toBe(true);
    expect(f.queries()).toHaveLength(0);
    f.contract.integration.resultKind = 'TOKEN';
    f.contract.integration.workflows = ['HTTP_SUBMIT'];
    await expect(f.apply()).rejects.toThrow('BROWSER_RESULT');
    expect(f.queries()).toHaveLength(0);
  });

  it('does not generate code after a query error or create a new task to recover', async () => {
    const f = fixture();
    await f.buy();
    f.failQuery();
    const result = await f.apply();
    expect(result.isError).toBe(true);
    expect(result.structuredContent ?? {}).not.toHaveProperty('apply');
    expect(f.buys()).toHaveLength(1);
  });

  it.each([{ id: 0 }, { productCode: 'RECAPTCHA_V2' }])(
    'does not bind an invalid task creation result',
    async (change) => {
      const f = fixture();
      Object.assign(f.record, change);
      expect((await f.buy()).structuredContent).toMatchObject({ code: 'OUTCOME_UNKNOWN' });
      expect((await f.apply()).structuredContent).toMatchObject({
        code: 'CAPTCHA_BINDING_REQUIRED'
      });
      expect(f.queries()).toHaveLength(0);
      expect(f.buys()).toHaveLength(1);
    }
  );

  it('retains an unknown purchase outcome rather than providing an application binding', async () => {
    const f = fixture();
    f.throwPurchase();
    expect((await f.buy()).structuredContent).toMatchObject({ code: 'OUTCOME_UNKNOWN' });
    expect((await f.apply()).structuredContent).toMatchObject({ code: 'CAPTCHA_BINDING_REQUIRED' });
    expect(f.queries()).toHaveLength(0);
    expect(f.buys()).toHaveLength(1);
  });

  it.each(['other-team', undefined])(
    'does not trust a purchase response with context=%s',
    async (context) => {
      const f = fixture();
      f.setPurchaseContext(context);
      expect((await f.buy()).structuredContent).toMatchObject({
        code: 'OUTCOME_UNKNOWN',
        recovery: { action: 'RECONCILE' }
      });
      expect((await f.apply()).structuredContent).toMatchObject({
        code: 'CAPTCHA_BINDING_REQUIRED'
      });
      expect(f.queries()).toHaveLength(0);
      expect(f.buys()).toHaveLength(1);
    }
  );

  it('validates the actual successful solution against the current online result schema', async () => {
    const f = fixture();
    await f.buy();
    Object.assign(f.contract.integration.resultSchema, {
      type: 'object',
      properties: { gRecaptchaResponse: { type: 'string' } },
      required: ['gRecaptchaResponse'],
      additionalProperties: false
    });
    Object.assign(f.record, {
      state: 'SUCCEEDED',
      solution: { token: 'not-declared-by-this-contract' }
    });
    const result = await f.apply();
    expect(result.isError).toBe(true);
    expect(result.structuredContent ?? {}).not.toHaveProperty('apply');
    expect(f.buys()).toHaveLength(1);
  });
});
