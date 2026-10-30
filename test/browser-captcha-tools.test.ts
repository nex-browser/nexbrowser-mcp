import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMcpSession, installFetchMock, onlineCaptchaContract } from './helpers.js';
import { createCaptchaTools } from '../src/features/captcha/captcha-tools.js';
import type { NexApiClient } from '../src/transport/nex-api-client.js';
import type { McpToolResult } from '../src/shared/types.js';

function expectNoPurchase(result: McpToolResult, message?: string) {
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({
    code: 'CAPTCHA_PREPARATION_REQUIRED',
    purchaseAttempted: false,
    recovery: { action: 'RETRY_CHALLENGE', reason: 'PREPARATION_REQUIRED' }
  });
  if (message) expect(JSON.stringify(result)).toContain(message);
}

function fixture() {
  const candidate = {
    challengeId: 'challenge',
    documentId: 'doc',
    productCode: 'GEETEST_V4',
    adapter: {
      websiteURL: 'https://site.test/register',
      captchaId: 'public-id',
      userAgent: 'Fixture'
    } as Record<string, unknown>,
    ready: true,
    frameIndex: 0,
    frameUrl: 'https://site.test/register'
  };
  const page = { pageId: 'page-1', url: 'https://site.test/register', candidates: [candidate] };
  const catalog = { price: '0.005', productCode: 'GEETEST_V4' };
  const products = [catalog];
  const record = { id: 42, productCode: 'GEETEST_V4', state: 'PROCESSING', solution: {} };
  const schemas: Record<string, Record<string, any>> = {
    GEETEST_V4: {
      type: 'object',
      properties: {
        websiteURL: { type: 'string' },
        captchaId: { type: 'string' },
        userAgent: { type: 'string' }
      },
      required: ['websiteURL', 'captchaId'],
      additionalProperties: false
    },
    GEETEST: {
      type: 'object',
      properties: {
        websiteURL: { type: 'string' },
        gt: { type: 'string' },
        challenge: { type: 'string' },
        apiServerSubdomain: { type: 'string' }
      },
      required: ['websiteURL', 'gt', 'challenge'],
      additionalProperties: false
    },
    RECAPTCHA_V2: {
      type: 'object',
      properties: { websiteURL: { type: 'string' }, websiteKey: { type: 'string' } },
      required: ['websiteURL', 'websiteKey'],
      additionalProperties: false
    },
    TURNSTILE: {
      type: 'object',
      properties: {
        websiteURL: { type: 'string' },
        websiteKey: { type: 'string' },
        action: { type: 'string' }
      },
      required: ['websiteURL', 'websiteKey'],
      additionalProperties: false
    }
  };
  schemas.CLOUDFLARE_TURNSTILE = schemas.TURNSTILE!;
  const integration = onlineCaptchaContract('fixture').integration;
  const gridResult = {
    applied: true,
    websiteVerified: false,
    gridState: 'WAITING_IMAGES'
  } as Record<string, any>;
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
    if (route === '/captcha/products') return ok(products);
    if (route === '/captcha/schema') {
      const { productCode } = JSON.parse(String(options?.body));
      return ok({
        ...onlineCaptchaContract(productCode),
        schema: schemas[productCode] ?? { type: 'object' },
        integration
      });
    }
    if (route === '/captcha/buy') return ok({ ...record });
    if (route === '/captcha/query') return ok({ ...record });
    const body = JSON.parse(String(options?.body));
    if (body.action === 'captchaInspect') return ok({ result: structuredClone(page) });
    if (body.action === 'captchaRefresh')
      return ok({
        result: { ...candidate, ready: true, adapter: { ...candidate.adapter, challenge: 'fresh' } }
      });
    if (body.action === 'captchaApply')
      return ok({
        result:
          candidate.productCode === 'GRID'
            ? gridResult
            : { applied: true, guidance: 'Inspect website' }
      });
    throw new Error(`Unexpected route: ${route}`);
  });
  const client = { request, getActiveSessionId: () => 'session' } as unknown as NexApiClient;
  const tools = createCaptchaTools(client);
  const call = async (suffix: string, args = {}) =>
    tools.find((tool) => tool.name === `nex_browser_captcha_${suffix}`)!.execute(args);
  const prepare = async (args = {}) => (await call('prepare', args)).structuredContent as any;
  const submit = (id: string) => call('submit', { prepareId: id });
  const buys = () => request.mock.calls.filter(([route]) => route === '/captcha/buy');
  const applies = () =>
    request.mock.calls.filter(([, options]) => String(options?.body).includes('captchaApply'));
  return {
    candidate,
    page,
    catalog,
    products,
    schemas,
    integration,
    gridResult,
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
  /** 模拟在线 GRID 契约和固定浏览器动作，不发起真实付费任务。 */
  function gridFixture() {
    const f = fixture();
    f.candidate.productCode = f.catalog.productCode = f.record.productCode = 'GRID';
    f.candidate.adapter = { body: 'private-grid-base64', comment: 'Select red squares' };
    Object.assign(f.candidate, {
      grid: {
        root: '#grid',
        tiles: '.tile',
        instruction: '#instruction',
        verify: '#verify',
        mode: 'dynamic',
        fingerprint: 'image-1',
        contentKey: 'sources-1',
        rows: 3,
        columns: 3
      }
    });
    f.schemas.GRID = {
      type: 'object',
      properties: { body: { type: 'string' }, comment: { type: 'string' } },
      required: ['body', 'comment'],
      additionalProperties: false
    };
    Object.assign(f.integration, {
      workflows: ['BROWSER_INTERACTION'],
      resultKind: 'GRID_CELLS',
      indexBase: 1,
      order: 'ROW_MAJOR'
    });
    f.record.solution = { click: [1, 5] };
    return f;
  }

  it('prepares a captured Grid, keeps the image private, and sends only body/comment to the online adapter', async () => {
    const f = gridFixture();
    const quote = await f.prepare();
    expect(quote).toMatchObject({
      ready: true,
      productCode: 'GRID',
      grid: { rows: 3, columns: 3 }
    });
    expect(JSON.stringify(quote)).not.toContain('private-grid-base64');
    expect(f.buys()).toHaveLength(0);
    await f.submit(quote.prepareId);
    expect(JSON.parse(String(f.buys()[0]![1]?.body)).adapter).toEqual({
      body: 'private-grid-base64',
      comment: 'Select red squares'
    });
    f.record.state = 'SUCCEEDED';
    expect(
      (await f.call('complete', { prepareId: quote.prepareId })).structuredContent
    ).toMatchObject({ applied: true, gridState: 'WAITING_IMAGES', websiteVerified: false });
    await f.call('complete', { prepareId: quote.prepareId });
    const requests = f.applies().map(([, options]) => JSON.parse(String(options?.body)).params);
    expect(requests.filter((params) => params.gridProgress !== true)).toHaveLength(1);
    expect(requests[0].solution).toEqual({ click: [1, 5] });
    expect(requests[1].gridProgress).toBe(true);
    expect(JSON.stringify(requests)).not.toContain('private-grid-base64');
  });

  /** 只有当前在线契约明确允许的增强字段才能随识别请求提交。 */
  it('requires explicitly captured Grid inputs instead of inventing values from declared fields', async () => {
    const f = gridFixture();
    Object.assign(f.schemas.GRID!.properties, {
      rows: { type: 'integer', minimum: 2 },
      columns: { type: 'integer', minimum: 2 },
      canNoAnswer: { type: 'integer', enum: [0, 1] }
    });
    f.schemas.GRID!.required.push('rows', 'columns', 'canNoAnswer');
    expect(await f.prepare()).toMatchObject({ ready: false });
    expect(f.buys()).toHaveLength(0);
    Object.assign(f.candidate.adapter, { rows: 3, columns: 3, canNoAnswer: 1 });
    const quote = await f.prepare();
    expect(quote.ready).toBe(true);
    await f.submit(quote.prepareId);
    expect(JSON.parse(String(f.buys()[0]![1]?.body)).adapter).toEqual({
      body: 'private-grid-base64',
      comment: 'Select red squares',
      rows: 3,
      columns: 3,
      canNoAnswer: 1
    });
  });

  /** 放开额外参数不表示后端实现了未声明的第三方选项。 */
  it('does not infer Grid options from a permissive additionalProperties rule', async () => {
    const f = gridFixture();
    f.schemas.GRID!.additionalProperties = true;
    const quote = await f.prepare();
    await f.submit(quote.prepareId);
    expect(JSON.parse(String(f.buys()[0]![1]?.body)).adapter).toEqual({
      body: 'private-grid-base64',
      comment: 'Select red squares'
    });
  });

  /** 不用本地假设覆盖线上类型、枚举或字段组合约束。 */
  it.each([
    { canNoAnswer: { type: 'boolean' } },
    { canNoAnswer: { type: 'integer', enum: [0] } },
    { rows: { type: 'integer', const: 4 } },
    { columns: { type: 'string' } }
  ])(
    'keeps the original adapter when optional Grid values violate $canNoAnswer $rows $columns',
    async (properties) => {
      const f = gridFixture();
      Object.assign(f.schemas.GRID!.properties, properties);
      const quote = await f.prepare();
      expect(quote.ready).toBe(true);
      await f.submit(quote.prepareId);
      expect(JSON.parse(String(f.buys()[0]![1]?.body)).adapter).toEqual({
        body: 'private-grid-base64',
        comment: 'Select red squares'
      });
    }
  );

  /** 增强字段也必须通过完整 Schema 的组合规则，不能只验证单个属性。 */
  it('honors full Grid schema constraints when adding optional values', async () => {
    const f = gridFixture();
    Object.assign(f.schemas.GRID!.properties, {
      rows: { type: 'integer' },
      columns: { type: 'integer' },
      canNoAnswer: { type: 'integer' }
    });
    f.schemas.GRID!.not = { required: ['rows', 'canNoAnswer'] };
    const quote = await f.prepare();
    expect(quote.ready).toBe(true);
    await f.submit(quote.prepareId);
    expect(JSON.parse(String(f.buys()[0]![1]?.body)).adapter).toEqual({
      body: 'private-grid-base64',
      comment: 'Select red squares'
    });
  });

  /** 无匹配结果保持空数组传给浏览器，不把它变成重购或重复选择。 */
  it('dispatches an empty Grid solution once and returns explicit website acceptance', async () => {
    const f = gridFixture();
    f.record.solution = { click: [] };
    Object.assign(f.gridResult, { gridState: 'ACCEPTED', websiteVerified: true });
    const quote = await f.prepare();
    await f.submit(quote.prepareId);
    f.record.state = 'SUCCEEDED';
    expect(
      (await f.call('complete', { prepareId: quote.prepareId })).structuredContent
    ).toMatchObject({
      applied: true,
      gridState: 'ACCEPTED',
      websiteVerified: true
    });
    const params = JSON.parse(String(f.applies()[0]![1]?.body)).params;
    expect(params.solution).toEqual({ click: [] });
    await f.call('complete', { prepareId: quote.prepareId });
    expect(
      f.applies().filter(([, options]) => !JSON.parse(String(options?.body)).params.gridProgress)
    ).toHaveLength(1);
    expect(f.buys()).toHaveLength(1);
  });

  /** 站点拒绝和新题不能混为一谈，拒绝后不准备下一轮或重复购买。 */
  it('returns Grid rejection without preparing or purchasing another round', async () => {
    const f = gridFixture();
    const quote = await f.prepare();
    await f.submit(quote.prepareId);
    f.record.state = 'SUCCEEDED';
    Object.assign(f.gridResult, {
      gridState: 'REJECTED',
      guidance: 'The website rejected the Grid answer. Stop automatic purchases.',
      nextCandidate: structuredClone(f.candidate)
    });
    for (let repeat = 0; repeat < 2; repeat++) {
      const completed = (await f.call('complete', { prepareId: quote.prepareId }))
        .structuredContent;
      expect(completed).toMatchObject({
        applied: true,
        websiteVerified: false,
        gridState: 'REJECTED',
        guidance: expect.stringContaining('Stop automatic purchases')
      });
      expect(completed).not.toHaveProperty('nextPrepareId');
      expect(completed).not.toHaveProperty('nextPreparation');
    }
    expect(f.buys()).toHaveLength(1);
    expect(f.request.mock.calls.filter(([route]) => route === '/captcha/query')).toHaveLength(1);
    expect(
      f.applies().filter(([, options]) => !JSON.parse(String(options?.body)).params.gridProgress)
    ).toHaveLength(1);
  });

  it('captures a changed round and prepares it without automatically charging', async () => {
    const f = gridFixture();
    const first = await f.prepare();
    await f.submit(first.prepareId);
    f.record.state = 'SUCCEEDED';
    // 页面仅在答案派发后切换到下一张图。
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (route, options) => {
      const body = options?.body ? JSON.parse(String(options.body)) : {};
      if (body.action === 'captchaApply') {
        f.candidate.challengeId = 'round-2';
        f.candidate.adapter.body = 'second-grid-base64';
        Object.assign((f.candidate as any).grid, {
          fingerprint: 'image-2',
          contentKey: 'sources-2'
        });
        Object.assign(f.gridResult, {
          gridState: 'NEXT_ROUND',
          nextCandidate: structuredClone(f.candidate)
        });
      }
      return original(route, options);
    });
    const completed = (await f.call('complete', { prepareId: first.prepareId }))
      .structuredContent as any;
    expect(completed).toMatchObject({
      gridState: 'NEXT_ROUND',
      nextPreparation: { ready: true }
    });
    expect(completed.nextPrepareId).toBe(completed.nextPreparation.prepareId);
    expect(JSON.stringify(completed)).not.toContain('grid-base64');
    await f.call('complete', { prepareId: first.prepareId });
    expect(f.buys()).toHaveLength(1);
    await f.submit(completed.nextPrepareId);
    expect(f.buys()).toHaveLength(2);
  });

  it('rejects a Grid image change before purchase or result application', async () => {
    for (const phase of ['submit', 'complete']) {
      const f = gridFixture();
      const quote = await f.prepare();
      if (phase === 'complete') {
        await f.submit(quote.prepareId);
        f.record.state = 'SUCCEEDED';
      }
      f.candidate.challengeId = 'new-image';
      if (phase === 'submit')
        expectNoPurchase(await f.submit(quote.prepareId), 'challenge changed');
      else
        await expect(f.call('complete', { prepareId: quote.prepareId })).rejects.toThrow(
          'challenge changed'
        );
      expect(f.buys()).toHaveLength(phase === 'submit' ? 0 : 1);
      expect(f.applies()).toHaveLength(0);
    }
  });

  it('does not replay Grid clicks after an unknown application outcome', async () => {
    const f = gridFixture();
    const quote = await f.prepare();
    await f.submit(quote.prepareId);
    f.record.state = 'SUCCEEDED';
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (route, options) => {
      if (String(options?.body).includes('captchaApply')) throw new Error('timeout after click');
      return original(route, options);
    });
    await expect(f.call('complete', { prepareId: quote.prepareId })).rejects.toThrow(
      'outcome is unknown'
    );
    await f.call('complete', { prepareId: quote.prepareId });
    expect(f.applies()).toHaveLength(1);
    expect(f.buys()).toHaveLength(1);
  });

  it('does not rebind an outstanding Grid task to an image changed during recognition', async () => {
    const f = gridFixture();
    const quote = await f.prepare();
    await f.submit(quote.prepareId);
    f.candidate.challengeId = 'changed-while-solving';
    expect(await f.prepare()).toMatchObject({ ready: false, prepareId: quote.prepareId });
    f.record.state = 'SUCCEEDED';
    await expect(f.call('complete', { prepareId: quote.prepareId })).rejects.toThrow(
      'challenge changed'
    );
    expect(f.applies()).toHaveLength(0);
    expect(f.buys()).toHaveLength(1);
  });

  it.each(['indexBase', 'order', 'resultKind'])(
    'blocks an incompatible Grid %s contract before payment',
    async (field) => {
      const f = gridFixture();
      (f.integration as Record<string, unknown>)[field] = 'unsupported';
      expect(await f.prepare()).toMatchObject({
        ready: false,
        reason: expect.stringContaining('ROW_MAJOR')
      });
      expect(f.buys()).toHaveLength(0);
    }
  );

  it('redacts Grid image bodies when multiple candidates need selection', async () => {
    const f = gridFixture();
    f.page.candidates.push({ ...f.candidate, challengeId: 'second' });
    const quote = await f.prepare();
    expect(quote.ready).toBe(false);
    expect(JSON.stringify(quote)).not.toContain('private-grid-base64');
  });

  it('accepts a newly supported page parameter from the current online schema', async () => {
    const f = fixture();
    f.candidate.productCode = 'RECAPTCHA_V2';
    f.catalog.productCode = 'RECAPTCHA_V2';
    f.record.productCode = 'RECAPTCHA_V2';
    f.candidate.adapter = {
      websiteURL: 'https://site.test/register',
      websiteKey: 'public-key',
      recaptchaDataSValue: 'current-challenge'
    };
    expect(await f.prepare()).toMatchObject({ ready: false });
    f.schemas.RECAPTCHA_V2!.properties.recaptchaDataSValue = { type: 'string' };
    const quote = await f.prepare();
    expect(quote).toMatchObject({ ready: true });
    await f.submit(quote.prepareId);
    expect(JSON.parse(String(f.buys()[0]![1]?.body)).adapter.recaptchaDataSValue).toBe(
      'current-challenge'
    );
  });

  it('prepares and applies enterprise reCAPTCHA only with its exact online product contract', async () => {
    const f = fixture();
    f.candidate.productCode =
      f.catalog.productCode =
      f.record.productCode =
        'RECAPTCHA_V2_ENTERPRISE';
    f.candidate.adapter = {
      websiteURL: 'https://site.test/register',
      websiteKey: 'enterprise-key',
      isInvisible: false,
      enterprisePayload: { s: 'observed-s' }
    };
    f.schemas.RECAPTCHA_V2_ENTERPRISE = {
      type: 'object',
      properties: {
        websiteURL: { type: 'string' },
        websiteKey: { type: 'string' },
        isInvisible: { type: 'boolean' },
        enterprisePayload: {
          type: 'object',
          properties: { s: { type: 'string' } },
          required: ['s'],
          additionalProperties: false
        }
      },
      required: ['websiteURL', 'websiteKey'],
      additionalProperties: false
    };
    const prepared = await f.prepare();
    expect(prepared.ready).toBe(true);
    expect(prepared.warnings).toBeUndefined();
    await f.submit(prepared.prepareId);
    expect(JSON.parse(String(f.buys()[0]![1]?.body))).toEqual({
      productCode: 'RECAPTCHA_V2_ENTERPRISE',
      adapter: f.candidate.adapter
    });
    f.record.state = 'SUCCEEDED';
    f.record.solution = { token: 'enterprise-token' };
    expect((await f.call('complete', { prepareId: prepared.prepareId })).isError).not.toBe(true);
    expect(JSON.parse(String(f.applies()[0]![1]?.body)).params).toMatchObject({
      productCode: 'RECAPTCHA_V2_ENTERPRISE',
      solution: { token: 'enterprise-token' }
    });
  });

  /** 使用线上 Nex Enterprise 字段集，所有购买请求仍由本地 mock 截获。 */
  function enterpriseFixture() {
    const f = fixture();
    f.candidate.productCode =
      f.catalog.productCode =
      f.record.productCode =
        'RECAPTCHA_V2_ENTERPRISE';
    f.candidate.adapter = {
      websiteURL: 'https://site.test/register',
      websiteKey: 'enterprise-key',
      isInvisible: false,
      enterprisePayload: { s: 'observed-s' }
    };
    f.schemas.RECAPTCHA_V2_ENTERPRISE = {
      type: 'object',
      properties: {
        websiteURL: { type: 'string' },
        websiteKey: { type: 'string' },
        pageAction: { type: 'string' },
        apiDomain: { type: 'string' },
        isEnterprise: { type: 'boolean' },
        minScore: { type: 'number' },
        userAgent: { type: 'string' },
        isInvisible: { type: 'boolean' }
      },
      required: ['websiteURL', 'websiteKey'],
      additionalProperties: false
    };
    return f;
  }

  it('does not drop an Enterprise payload absent from the online schema', async () => {
    const f = enterpriseFixture();
    const original = structuredClone(f.candidate.adapter);
    expect(await f.prepare()).toMatchObject({
      ready: false,
      reason: expect.stringContaining('online contract'),
      agentIntegration: { route: 'AGENT' }
    });
    expect(f.candidate.adapter).toEqual(original);
    expect(f.buys()).toHaveLength(0);
  });

  it.each(['recaptchaDataSValue', 's'])(
    'does not rename Enterprise payload to declared %s',
    async (field) => {
      const f = enterpriseFixture();
      f.schemas.RECAPTCHA_V2_ENTERPRISE!.properties[field] = { type: 'string' };
      expect(await f.prepare()).toMatchObject({ ready: false });
      expect(f.candidate.adapter).not.toHaveProperty(field);
      expect(f.candidate.adapter.enterprisePayload).toEqual({ s: 'observed-s' });
      expect(f.buys()).toHaveLength(0);
    }
  );

  it('revalidates the unchanged Enterprise payload if the submit-time schema removes support', async () => {
    const f = enterpriseFixture();
    f.schemas.RECAPTCHA_V2_ENTERPRISE!.properties.enterprisePayload = { type: 'object' };
    const prepared = await f.prepare();
    expect(prepared.ready).toBe(true);
    delete f.schemas.RECAPTCHA_V2_ENTERPRISE!.properties.enterprisePayload;
    expectNoPurchase(await f.submit(prepared.prepareId), 'online contract');
    expect(f.candidate.adapter.enterprisePayload).toEqual({ s: 'observed-s' });
    expect(f.buys()).toHaveLength(0);
  });

  it('honors nested Enterprise payload constraints without stripping extra members', async () => {
    const f = enterpriseFixture();
    f.schemas.RECAPTCHA_V2_ENTERPRISE!.properties.enterprisePayload = {
      type: 'object',
      properties: { s: { type: 'string' } },
      required: ['s'],
      additionalProperties: false
    };
    const prepared = await f.prepare();
    expect(prepared.ready).toBe(true);
    f.candidate.adapter.enterprisePayload = { s: 'observed-s', extra: 'observed-value' };
    expectNoPurchase(await f.submit(prepared.prepareId), 'online contract');
    expect(f.candidate.adapter.enterprisePayload).toEqual({
      s: 'observed-s',
      extra: 'observed-value'
    });
    expect(f.buys()).toHaveLength(0);
  });

  it('does not downgrade enterprise reCAPTCHA to a standard product or ignore online constraints', async () => {
    const f = fixture();
    f.candidate.productCode = 'RECAPTCHA_V2_ENTERPRISE';
    f.candidate.adapter = {
      websiteURL: 'https://site.test/register',
      websiteKey: 'key',
      enterprisePayload: { s: 'observed-s' }
    };
    f.catalog.productCode = 'RECAPTCHA_V2';
    expect(await f.prepare()).toMatchObject({ ready: false });
    f.catalog.productCode = 'RECAPTCHA_V2_ENTERPRISE';
    f.schemas.RECAPTCHA_V2_ENTERPRISE = {
      type: 'object',
      properties: { websiteURL: { type: 'string' }, websiteKey: { type: 'string' } },
      required: ['websiteURL', 'websiteKey', 'requiredRuntimeInput'],
      additionalProperties: false
    };
    expect(await f.prepare()).toMatchObject({ ready: false });
    expect(f.buys()).toHaveLength(0);
  });

  it.each(['DOCUMENTATION_REQUIRED', 'workflow', 'network', 'changed-rule'])(
    'stops before buying when the online page contract is %s',
    async (change) => {
      const f = fixture();
      const quote = await f.prepare();
      if (change === 'DOCUMENTATION_REQUIRED') f.integration.readiness = change;
      if (change === 'workflow') f.integration.workflows = ['HTTP_SUBMIT'];
      if (change === 'changed-rule') f.schemas.GEETEST_V4!.required.push('newRequiredField');
      if (change === 'network') {
        const original = f.request.getMockImplementation()!;
        f.request.mockImplementation(async (route, options) => {
          if (route === '/captcha/schema') throw new Error('offline');
          return original(route, options);
        });
      }
      expectNoPurchase(await f.submit(quote.prepareId));
      expect(f.buys()).toHaveLength(0);
    }
  );

  it('preserves schema-correct GeeTest inputs before and after challenge refresh', async () => {
    const f = fixture();
    f.candidate.productCode = 'GEETEST';
    f.catalog.productCode = 'GEETEST';
    f.record.productCode = 'GEETEST';
    f.candidate.adapter = {
      websiteURL: 'https://site.test/register',
      gt: 'gt',
      apiServerSubdomain: 'api.geetest.test'
    };
    f.candidate.ready = false;
    (f.candidate as any).reason = 'Fresh challenge required';
    const quote = await f.prepare({ challengeUrl: 'https://site.test/challenge' });
    expect(quote).toMatchObject({
      ready: true,
      adapter: { apiServerSubdomain: 'api.geetest.test' }
    });
    expect(quote.adapter).not.toHaveProperty('geetestApiServerSubdomain');
    expect(f.buys()).toHaveLength(0);
    await f.submit(quote.prepareId);
    expect(JSON.parse(String(f.buys()[0]![1]?.body)).adapter).toEqual({
      websiteURL: 'https://site.test/register',
      gt: 'gt',
      challenge: 'fresh',
      apiServerSubdomain: 'api.geetest.test'
    });
  });

  it('rejects undeclared GeeTest field aliases without renaming or stripping them', async () => {
    const f = fixture();
    f.candidate.productCode = 'GEETEST';
    f.catalog.productCode = 'GEETEST';
    f.candidate.adapter = {
      websiteURL: 'https://site.test/register',
      gt: 'gt',
      challenge: 'challenge',
      apiServerSubdomain: 'api.example.test',
      geetestApiServerSubdomain: 'different.example.test'
    };
    expect(await f.prepare()).toMatchObject({
      ready: false,
      reason: expect.stringContaining('online contract')
    });
    expect(f.buys()).toHaveLength(0);
  });

  it.each(['prepare', 'submit'])(
    'blocks unsupported reCAPTCHA data-s during %s without discarding it or charging',
    async (stage) => {
      const f = fixture();
      f.candidate.productCode = 'RECAPTCHA_V2';
      f.catalog.productCode = 'RECAPTCHA_V2';
      f.candidate.adapter = { websiteURL: 'https://site.test/register', websiteKey: 'public-key' };
      const quote = stage === 'submit' ? await f.prepare() : undefined;
      f.candidate.adapter.recaptchaDataSValue = 'private-challenge-parameter';
      if (stage === 'prepare') {
        const blocked = await f.prepare();
        expect(blocked).toMatchObject({
          ready: false,
          reason: expect.stringContaining('online contract')
        });
        expect(JSON.stringify(blocked)).not.toContain('private-challenge-parameter');
      } else {
        expectNoPurchase(await f.submit(quote.prepareId), 'online contract');
      }
      expect(f.buys()).toHaveLength(0);
    }
  );

  it.each([
    ['GEETEST_V4', { websiteURL: 'https://site.test/register', captchaId: 5 }],
    ['RECAPTCHA_V2', { websiteURL: 'https://site.test/register' }],
    ['TURNSTILE', { websiteURL: 'https://site.test/register', websiteKey: 'key', action: false }],
    ['GEETEST', { websiteURL: 'https://site.test/register', gt: 5, challenge: 'challenge' }]
  ])(
    'validates the existing %s bridge adapter before preparing a paid workflow',
    async (code, adapter) => {
      const f = fixture();
      f.candidate.productCode = code as string;
      f.catalog.productCode = code as string;
      f.candidate.adapter = adapter as Record<string, unknown>;
      expect(await f.prepare()).toMatchObject({
        ready: false,
        reason: expect.stringContaining('contract')
      });
      expect(f.buys()).toHaveLength(0);
    }
  );

  it('validates recollected inputs again immediately before purchase', async () => {
    const f = fixture();
    const quote = await f.prepare();
    f.candidate.adapter.apiKey = 'private-key-not-for-the-service';
    const result = await f.submit(quote.prepareId);
    expectNoPurchase(result);
    const message = JSON.stringify(result);
    expect(message).toContain('Platform API keys');
    expect(message).not.toContain('private-key-not-for-the-service');
    expect(f.buys()).toHaveLength(0);
  });

  it.each(['RECAPTCHA_V3', 'FUTURE_PRODUCT'])(
    'trusts a ready Desktop capture for %s without an MCP product whitelist',
    async (productCode) => {
      const f = fixture();
      f.candidate.productCode = productCode;
      f.catalog.productCode = productCode;
      expect(await f.prepare()).toMatchObject({ ready: true, productCode });
      expect(f.buys()).toHaveLength(0);
    }
  );

  it('hands off a missing fixed capture without suggesting a charge', async () => {
    const f = fixture();
    f.page.candidates.length = 0;
    expect(await f.prepare()).toMatchObject({
      ready: false,
      agentIntegration: { route: 'AGENT', purchaseAttempted: false }
    });
    expect(f.buys()).toHaveLength(0);
    expect(f.applies()).toHaveLength(0);
  });

  it('hands off an interaction contract instead of treating it as an unsupported product', async () => {
    const f = fixture();
    f.candidate.productCode = f.catalog.productCode = 'CLICK';
    f.integration.workflows = ['BROWSER_INTERACTION'];
    f.integration.resultKind = 'IMAGE_COORDINATES';
    expect(await f.prepare()).toMatchObject({
      ready: false,
      agentIntegration: {
        route: 'AGENT',
        workflow: 'BROWSER_INTERACTION',
        purchaseAttempted: false,
        onlineContract: { productCode: 'CLICK' }
      }
    });
    expect(f.buys()).toHaveLength(0);
    expect(f.applies()).toHaveLength(0);
  });

  it.each([
    ['TURNSTILE', 'CLOUDFLARE_TURNSTILE'],
    ['TURNSTILE', 'TURNSTILE'],
    ['CLOUDFLARE_TURNSTILE', 'CLOUDFLARE_TURNSTILE'],
    ['CLOUDFLARE_TURNSTILE', 'TURNSTILE']
  ])('uses the quoted %s widget product code %s throughout the task', async (widget, product) => {
    const f = fixture();
    f.candidate.productCode = widget;
    f.candidate.adapter = {
      websiteURL: 'https://site.test/register',
      websiteKey: 'public-key'
    };
    f.catalog.productCode = product;
    f.record.productCode = product;
    const quote = await f.prepare();
    expect(quote).toMatchObject({ productCode: product, ready: true });
    expect(f.buys()).toHaveLength(0);
    await f.submit(quote.prepareId);
    await f.submit(quote.prepareId);
    expect(f.buys()).toHaveLength(1);
    expect(JSON.parse(String(f.buys()[0]![1]?.body))).toEqual({
      productCode: product,
      adapter: { websiteURL: 'https://site.test/register', websiteKey: 'public-key' }
    });
    f.record.state = 'SUCCEEDED';
    f.record.solution = { token: 'private-token' };
    const completed = await f.call('complete', { prepareId: quote.prepareId });
    expect(completed.structuredContent).toMatchObject({ applied: true, websiteVerified: false });
    expect(JSON.stringify(completed)).not.toContain('private-token');
    expect(JSON.parse(String(f.applies()[0]![1]?.body)).params.productCode).toBe(widget);
  });

  it.each([false, true])(
    'preserves captured Turnstile userAgent and follows online declaration=%s',
    async (declared) => {
      const f = fixture();
      f.candidate.productCode =
        f.catalog.productCode =
        f.record.productCode =
          'CLOUDFLARE_TURNSTILE';
      f.candidate.adapter = {
        websiteURL: 'https://site.test/register',
        websiteKey: 'public-key',
        userAgent: 'Actual browser UA'
      };
      if (declared) f.schemas.CLOUDFLARE_TURNSTILE!.properties.userAgent = { type: 'string' };
      const original = structuredClone(f.candidate.adapter);
      const prepared = await f.prepare();
      expect(prepared.ready).toBe(declared);
      expect(f.candidate.adapter).toEqual(original);
      expect(f.buys()).toHaveLength(0);
      if (declared) {
        await f.submit(prepared.prepareId);
        expect(JSON.parse(String(f.buys()[0]![1]?.body)).adapter).toEqual(original);
      } else {
        expect(prepared).toMatchObject({
          reason: expect.stringContaining('online contract'),
          agentIntegration: { route: 'AGENT' }
        });
      }
    }
  );

  it('prefers an exact Turnstile catalog code over its alias regardless of catalog order', async () => {
    const f = fixture();
    f.candidate.productCode = 'TURNSTILE';
    f.candidate.adapter = { websiteURL: 'https://site.test/register', websiteKey: 'public-key' };
    f.catalog.productCode = 'TURNSTILE';
    f.products.unshift({ productCode: 'CLOUDFLARE_TURNSTILE', price: '0.009' });
    f.record.productCode = 'TURNSTILE';
    const quote = await f.prepare();
    expect(quote).toMatchObject({ productCode: 'TURNSTILE', ready: true });
    await f.submit(quote.prepareId);
    expect(JSON.parse(String(f.buys()[0]![1]?.body)).productCode).toBe('TURNSTILE');
  });

  it.each(['CLOUDFLARE_CHALLENGE', 'CLOUDFLARE_TURNSTILE_PROXY', 'RECAPTCHA_V2'])(
    'does not match a Turnstile widget to an unrelated product %s',
    async (productCode) => {
      const f = fixture();
      f.candidate.productCode = 'TURNSTILE';
      f.catalog.productCode = productCode;
      expect(await f.prepare()).toMatchObject({ ready: false });
      expect(f.buys()).toHaveLength(0);
    }
  );

  it('requires new preparation if the catalog switches between canonical and legacy product codes', async () => {
    const f = fixture();
    f.candidate.productCode = 'TURNSTILE';
    f.candidate.adapter = { websiteURL: 'https://site.test/register', websiteKey: 'public-key' };
    f.catalog.productCode = 'CLOUDFLARE_TURNSTILE';
    const quote = await f.prepare();
    f.catalog.productCode = 'TURNSTILE';
    expectNoPurchase(await f.submit(quote.prepareId), 'product changed');
    expect(f.buys()).toHaveLength(0);
  });

  it('rejects a page product change even when the challenge identity is unchanged', async () => {
    const f = fixture();
    const quote = await f.prepare();
    f.candidate.productCode = 'TURNSTILE';
    expectNoPurchase(await f.submit(quote.prepareId), 'page/document/challenge changed');
    expect(f.buys()).toHaveLength(0);
  });

  it.each(['creation', 'query'])(
    'rejects an alias-mismatched %s record rather than accepting a different quoted product',
    async (phase) => {
      const f = fixture();
      f.candidate.productCode = 'TURNSTILE';
      f.candidate.adapter = { websiteURL: 'https://site.test/register', websiteKey: 'public-key' };
      f.catalog.productCode = 'CLOUDFLARE_TURNSTILE';
      f.record.productCode = 'CLOUDFLARE_TURNSTILE';
      const quote = await f.prepare();
      if (phase === 'query') await f.submit(quote.prepareId);
      f.record.productCode = 'TURNSTILE';
      if (phase === 'creation') {
        expect((await f.submit(quote.prepareId)).structuredContent).toMatchObject({
          recovery: { action: 'RECONCILE', resourceType: 'captcha' }
        });
        await f.submit(quote.prepareId);
      } else {
        f.record.state = 'SUCCEEDED';
        await expect(f.call('complete', { prepareId: quote.prepareId })).rejects.toThrow(
          'identity/product mismatch'
        );
      }
      expect(f.buys()).toHaveLength(1);
      expect(f.applies()).toHaveLength(0);
    }
  );

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
      expect(Object.keys(schema.properties ?? {})).toEqual(['prepareId']);
      expect(schema.required).toEqual(['prepareId']);
      const quote = await session.client.callTool({
        name: 'nex_browser_captcha_prepare',
        arguments: { sessionId: 'session', pageId: 'page-1' }
      });
      const prepareId = (quote.structuredContent as any).prepareId;
      expect(prepareId).toBeTypeOf('string');
      const submitted = await session.client.callTool({
        name: 'nex_browser_captcha_submit',
        arguments: { prepareId }
      });
      expect(submitted.isError).not.toBe(true);
      expect(JSON.parse(String(f.buys()[0]![1]?.body))).toEqual({
        productCode: 'GEETEST_V4',
        adapter: {
          websiteURL: 'https://site.test/register',
          captchaId: 'public-id',
          userAgent: 'Fixture'
        }
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

  it('uses the current server price without stopping for price changes', async () => {
    const f = fixture();
    const quote = await f.prepare();
    f.catalog.price = '0.006';
    await f.submit(quote.prepareId);
    expect(JSON.parse(String(f.buys()[0]![1]?.body))).not.toHaveProperty('maxTotalPrice');
    expect(f.buys()).toHaveLength(1);
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
      f.candidate.frameIndex = n;
      const quote = await f.prepare();
      ids.push(quote.prepareId);
      await f.submit(quote.prepareId);
    }
    const results = await Promise.all(ids.map((prepareId) => f.call('complete', { prepareId })));
    expect(f.request.mock.calls.filter(([route]) => route === '/captcha/query')).toHaveLength(5);
    expect(results[5]!.structuredContent?.retryAfterMs).toBeGreaterThan(0);
  });
  it('prepares freely, charges directly once and applies without exposing the solution', async () => {
    const f = fixture();
    const quote = await f.prepare();
    expect(quote).toMatchObject({ ready: true });
    expect(quote).not.toHaveProperty('requiresConfirmation');
    expect(quote).not.toHaveProperty('price');
    expect(f.buys()).toHaveLength(0);
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

  it.each(['team', 'navigation', 'challenge', 'expiry'] as const)(
    'does not charge after %s changes',
    async (change) => {
      const f = fixture();
      const quote = await f.prepare();
      if (change === 'team') f.changeTeam();
      if (change === 'navigation') f.page.url = 'https://other.test/';
      if (change === 'challenge') f.candidate.challengeId = 'reset';
      if (change === 'expiry') {
        f.candidate.ready = false;
        (f.candidate as any).reason = 'Expired';
      }
      expectNoPurchase(await f.submit(quote.prepareId));
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
    expect((await f.submit(quote.prepareId)).structuredContent).toMatchObject({
      recovery: { action: 'RECONCILE', resourceType: 'captcha' }
    });
    expect((await f.submit(quote.prepareId)).structuredContent).not.toHaveProperty(
      'purchaseAttempted',
      false
    );
    await f.submit(quote.prepareId);
    expect((await f.prepare()).state).toBe('OUTCOME_UNKNOWN');
    f.candidate.challengeId = 'changed-after-unknown-purchase';
    expect(await f.prepare()).toMatchObject({ ready: false, state: 'OUTCOME_UNKNOWN' });
    expect(f.buys()).toHaveLength(1);
  });

  it('recovers from an unknown prepareId without a purchase or financial reconciliation lock', async () => {
    const f = fixture();
    expectNoPurchase(await f.submit('missing-prepare-id'), 'Unknown prepareId');
    expect(f.request).not.toHaveBeenCalled();
    const prepared = await f.prepare();
    await f.submit(prepared.prepareId);
    expect(f.buys()).toHaveLength(1);
  });

  it('re-prepares an expired unpurchased workflow without marking the outcome unknown', async () => {
    const f = fixture();
    const prepared = await f.prepare();
    const now = vi.spyOn(Date, 'now').mockReturnValue(prepared.expiresAt + 1);
    try {
      expectNoPurchase(await f.submit(prepared.prepareId), 'preparation expired');
      expect(f.buys()).toHaveLength(0);
    } finally {
      now.mockRestore();
    }
    const fresh = await f.prepare();
    await f.submit(fresh.prepareId);
    expect(f.buys()).toHaveLength(1);
  });

  it('identifies a concurrent preflight as unpurchased while the original workflow completes once', async () => {
    const f = fixture();
    const prepared = await f.prepare();
    const original = f.request.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.request.mockImplementation(async (route, options) => {
      if (route === '/captcha/products') await gate;
      return original(route, options);
    });
    const first = f.submit(prepared.prepareId);
    expectNoPurchase(await f.submit(prepared.prepareId), 'workflow is busy');
    release();
    await first;
    expect(f.buys()).toHaveLength(1);
  });

  it('preserves insufficient balance as a paid-operation stop instead of an unknown purchase', async () => {
    const f = fixture();
    const prepared = await f.prepare();
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (route, options) =>
      route === '/captcha/buy'
        ? ({ code: -1208, msg: '余额不足', contextId: 'team-a-revision', data: null } as any)
        : original(route, options)
    );
    const result = await f.submit(prepared.prepareId);
    expect(result.structuredContent).toMatchObject({
      code: -1208,
      billingBlocked: true,
      stopPaidOperations: true
    });
    expect(result.structuredContent).not.toHaveProperty('recovery');
    expect(JSON.stringify(result)).not.toContain('outcome is unknown');
    expect(f.buys()).toHaveLength(1);
  });

  it.each(['FAILED', 'EXPIRED'])(
    'permits a genuinely new challenge after confirmed %s but never the same challenge',
    async (state) => {
      const f = fixture();
      const first = await f.prepare();
      await f.submit(first.prepareId);
      f.record.state = state;
      expect(
        (await f.call('complete', { prepareId: first.prepareId })).structuredContent
      ).toMatchObject({
        recovery: { action: 'RETRY_CHALLENGE', resourceType: 'captcha', maxAttempts: 3 }
      });
      expect(await f.prepare()).toMatchObject({ ready: false, prepareId: first.prepareId });
      f.candidate.challengeId = 'fresh-challenge';
      const next = await f.prepare();
      expect(next).toMatchObject({ ready: true });
      expect(next.prepareId).not.toBe(first.prepareId);
      f.record.state = 'PROCESSING';
      await f.submit(next.prepareId);
      expect(f.buys()).toHaveLength(2);
    }
  );

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

  it('requires a fresh GeeTest v3 endpoint and refreshes only on submit', async () => {
    const f = fixture();
    f.candidate.productCode = 'GEETEST';
    f.candidate.adapter = { websiteURL: 'https://site.test/register', gt: 'gt' };
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
