import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMcpSession, installFetchMock } from './helpers.js';
import { createCaptchaTools } from '../src/features/captcha/captcha-tools.js';
import type { NexApiClient } from '../src/transport/nex-api-client.js';

function fixture() {
  const candidate = {
    challengeId: 'challenge',
    documentId: 'doc',
    productCode: 'GEETEST_V4',
    adapter: {
      websiteURL: 'https://site.test/register',
      captchaId: 'public-id',
      userAgent: 'Fixture'
    },
    ready: true,
    frameIndex: 0,
    frameUrl: 'https://site.test/register'
  };
  const page = { pageId: 'page-1', url: 'https://site.test/register', candidates: [candidate] };
  const catalog = { price: '0.005', productCode: 'GEETEST_V4' };
  const record = { id: 42, productCode: 'GEETEST_V4', state: 'PROCESSING', solution: {} };
  let contextId = 'team-a-revision';
  const ok = (data: unknown) => ({ code: 0, msg: 'ok', data, contextId });
  const request = vi.fn(async (route: string, options?: RequestInit) => {
    const headers = new Headers(options?.headers);
    if (
      headers.get('X-Nex-Service-Context') &&
      headers.get('X-Nex-Service-Context') !== contextId
    ) {
      return { code: 'SESSION_CONTEXT_CHANGED', msg: 'Changed', data: null, contextId };
    }
    if (route === '/captcha/products') return ok([catalog]);
    if (route === '/captcha/buy') return ok({ ...record });
    if (route === '/captcha/query') return ok({ ...record });
    const body = JSON.parse(String(options?.body));
    if (body.action === 'captchaInspect') return ok({ result: structuredClone(page) });
    if (body.action === 'captchaRefresh')
      return ok({
        result: { ...candidate, ready: true, adapter: { gt: 'gt', challenge: 'fresh' } }
      });
    if (body.action === 'captchaApply')
      return ok({ result: { applied: true, guidance: 'Inspect website' } });
    throw new Error(`Unexpected route: ${route}`);
  });
  const client = { request, getActiveSessionId: () => 'session' } as unknown as NexApiClient;
  const tools = createCaptchaTools(client);
  const call = async (suffix: string, args = {}) =>
    tools.find((tool) => tool.name === `nex_browser_captcha_${suffix}`)!.execute(args);
  const prepare = async (args = {}) => (await call('prepare', args)).structuredContent as any;
  const submit = (id: string, maxTotalPrice: string | number = '0.005') =>
    call('submit', { prepareId: id, confirmed: true, maxTotalPrice });
  const buys = () => request.mock.calls.filter(([route]) => route === '/captcha/buy');
  const applies = () =>
    request.mock.calls.filter(([, options]) => String(options?.body).includes('captchaApply'));
  return {
    candidate,
    page,
    catalog,
    record,
    request,
    call,
    prepare,
    submit,
    buys,
    applies,
    changeTeam: () => {
      contextId = 'team-b-revision';
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser NexCaptcha workflow', () => {
  it('runs prepare/submit/complete through the real MCP registration and transport', async () => {
    const f = fixture();
    installFetchMock(async (url, options) => {
      if (options?.method === 'DELETE') return new Response('{"code":0,"msg":"ok"}');
      const result = await f.request(new URL(String(url)).pathname, options);
      return new Response(JSON.stringify(result));
    });
    const session = await createMcpSession({
      apiHost: 'http://127.0.0.1:45536',
      apiKey: 'fixture',
      timeout: 2_000
    });
    try {
      const listed = await session.client.listTools();
      const schema = listed.tools.find(
        (tool) => tool.name === 'nex_browser_captcha_submit'
      )!.inputSchema;
      expect(schema.properties).toHaveProperty('confirmed');
      const quote = await session.client.callTool({
        name: 'nex_browser_captcha_prepare',
        arguments: { sessionId: 'session', pageId: 'page-1' }
      });
      const prepareId = (quote.structuredContent as any).prepareId;
      expect(prepareId).toBeTypeOf('string');
      const submitted = await session.client.callTool({
        name: 'nex_browser_captcha_submit',
        arguments: { prepareId, confirmed: true, maxTotalPrice: '0.005' }
      });
      expect(submitted.isError).not.toBe(true);
      expect(JSON.parse(String(f.buys()[0]![1]?.body))).toEqual({
        productCode: 'GEETEST_V4',
        adapter: {
          websiteURL: 'https://site.test/register',
          captchaId: 'public-id',
          userAgent: 'Fixture'
        },
        maxTotalPrice: '0.005'
      });
      f.record.state = 'SUCCEEDED';
      f.record.solution = { token: 'private-answer' };
      const completed = await session.client.callTool({
        name: 'nex_browser_captcha_complete',
        arguments: { prepareId }
      });
      expect(completed.structuredContent).toMatchObject({ applied: true, websiteVerified: false });
      expect(JSON.stringify(completed)).not.toContain('private-answer');
      expect(f.buys()).toHaveLength(1);
      expect(new Headers(f.applies()[0]![1]?.headers).get('X-Nex-Service-Context')).toBe(
        'team-a-revision'
      );
    } finally {
      await session.close();
    }
  });

  it('retains the quoted ceiling even if the caller approves a larger maximum', async () => {
    const f = fixture();
    const quote = await f.prepare();
    await f.submit(quote.prepareId, 1);
    expect(JSON.parse(String(f.buys()[0]![1]?.body)).maxTotalPrice).toBe('0.005');
  });

  it('does not dispatch again when application times out after a site request may have started', async () => {
    const f = fixture();
    const quote = await f.prepare();
    await f.submit(quote.prepareId);
    f.record.state = 'SUCCEEDED';
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (route, options) => {
      if (String(options?.body).includes('captchaApply')) throw new Error('connection lost');
      return original(route, options);
    });
    await expect(f.call('complete', { prepareId: quote.prepareId })).rejects.toThrow(
      'callback outcome is unknown'
    );
    expect(
      (await f.call('complete', { prepareId: quote.prepareId })).structuredContent
    ).toMatchObject({ state: 'APPLY_OUTCOME_UNKNOWN' });
    expect(f.applies()).toHaveLength(1);
    expect(f.buys()).toHaveLength(1);
  });

  it('limits queries across concurrent tasks to five per three seconds', async () => {
    const f = fixture();
    const ids: string[] = [];
    for (let n = 0; n < 6; n++) {
      f.candidate.challengeId = `challenge-${n}`;
      const quote = await f.prepare();
      ids.push(quote.prepareId);
      await f.submit(quote.prepareId);
    }
    const results = await Promise.all(ids.map((prepareId) => f.call('complete', { prepareId })));
    expect(f.request.mock.calls.filter(([route]) => route === '/captcha/query')).toHaveLength(5);
    expect(results[5]!.structuredContent?.retryAfterMs).toBeGreaterThan(0);
  });
  it('quotes freely, requires confirmation, submits once and applies without exposing the solution', async () => {
    const f = fixture();
    const quote = await f.prepare();
    expect(quote).toMatchObject({ price: '0.005', currency: 'USDT', requiresConfirmation: true });
    expect(f.buys()).toHaveLength(0);
    await expect(
      f.call('submit', { prepareId: quote.prepareId, maxTotalPrice: 1 })
    ).rejects.toThrow();
    await expect(f.submit(quote.prepareId, '0.004999999999999999')).rejects.toThrow('ceiling');
    await f.submit(quote.prepareId);
    await f.submit(quote.prepareId);
    expect(f.buys()).toHaveLength(1);
    f.record.state = 'SUCCEEDED';
    f.record.solution = { secret: 'answer-only-in-browser' };
    const result = await f.call('complete', { prepareId: quote.prepareId });
    expect(result.structuredContent).toMatchObject({
      localId: 42,
      applied: true,
      websiteVerified: false
    });
    expect(JSON.stringify(result)).not.toContain('answer-only-in-browser');
    await f.call('complete', { prepareId: quote.prepareId });
    expect(f.applies()).toHaveLength(1);
    expect(new Headers(f.buys()[0]![1]?.headers).get('X-Nex-Service-Context')).toBe(
      'team-a-revision'
    );
  });

  it.each(['price', 'team', 'navigation', 'challenge', 'expiry'] as const)(
    'does not charge after %s changes',
    async (change) => {
      const f = fixture();
      const quote = await f.prepare();
      if (change === 'price') f.catalog.price = '0.006';
      if (change === 'team') f.changeTeam();
      if (change === 'navigation') f.page.url = 'https://other.test/';
      if (change === 'challenge') f.candidate.challengeId = 'reset';
      if (change === 'expiry') {
        f.candidate.ready = false;
        (f.candidate as any).reason = 'Expired';
      }
      await expect(f.submit(quote.prepareId)).rejects.toThrow();
      expect(f.buys()).toHaveLength(0);
    }
  );

  it('keeps unknown purchases blocked even through a new prepare', async () => {
    const f = fixture();
    const quote = await f.prepare();
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (route, options) => {
      if (route === '/captcha/buy') throw new Error('timeout after debit');
      return original(route, options);
    });
    await expect(f.submit(quote.prepareId)).rejects.toThrow('timeout');
    await f.submit(quote.prepareId);
    expect((await f.prepare()).state).toBe('OUTCOME_UNKNOWN');
    expect(f.buys()).toHaveLength(1);
  });

  it('prevents a concurrent prepare or submit from creating two tasks', async () => {
    const f = fixture();
    const quote = await f.prepare();
    await Promise.allSettled([f.submit(quote.prepareId), f.submit(quote.prepareId), f.prepare()]);
    expect(f.buys()).toHaveLength(1);
  });

  it.each(['FAILED', 'EXPIRED', 'PROCESSING', 'UNKNOWN'])(
    'handles %s without applying or repurchasing',
    async (state) => {
      const f = fixture();
      const quote = await f.prepare();
      await f.submit(quote.prepareId);
      f.record.state = state;
      await f.call('complete', { prepareId: quote.prepareId });
      await f.call('complete', { prepareId: quote.prepareId });
      expect(f.request.mock.calls.filter(([route]) => route === '/captcha/query')).toHaveLength(1);
      expect(f.applies()).toHaveLength(0);
      expect(f.buys()).toHaveLength(1);
    }
  );

  it.each(['team', 'document', 'record'])('rejects a stale %s before applying', async (change) => {
    const f = fixture();
    const quote = await f.prepare();
    await f.submit(quote.prepareId);
    f.record.state = 'SUCCEEDED';
    if (change === 'team') f.changeTeam();
    if (change === 'document') f.candidate.documentId = 'new-document';
    if (change === 'record') f.record.id = 99;
    await expect(f.call('complete', { prepareId: quote.prepareId })).rejects.toThrow();
    expect(f.applies()).toHaveLength(0);
  });

  it('requires an explicit widget choice when multiple challenges exist', async () => {
    const f = fixture();
    f.page.candidates.push({ ...f.candidate, challengeId: 'second' });
    expect((await f.prepare()).ready).toBe(false);
    expect((await f.prepare({ challengeId: 'second' })).ready).toBe(true);
    expect(f.buys()).toHaveLength(0);
  });

  it('requires a fresh GeeTest v3 endpoint and refreshes only after confirmation', async () => {
    const f = fixture();
    f.candidate.productCode = 'GEETEST';
    f.catalog.productCode = 'GEETEST';
    f.record.productCode = 'GEETEST';
    f.candidate.ready = false;
    (f.candidate as any).reason = 'Fresh challenge required';
    expect((await f.prepare()).ready).toBe(false);
    const quote = await f.prepare({ challengeUrl: 'https://site.test/challenge' });
    expect(
      f.request.mock.calls.some(([, options]) => String(options?.body).includes('captchaRefresh'))
    ).toBe(false);
    await f.submit(quote.prepareId);
    expect(JSON.parse(String(f.buys()[0]![1]?.body)).adapter.challenge).toBe('fresh');
  });
});
