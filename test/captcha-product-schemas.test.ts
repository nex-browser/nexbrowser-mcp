import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, createCaptchaTools, type NexApiClient } from '../src/index.js';
import { CAPTCHA_ADAPTER_SCHEMAS } from '../src/features/captcha/captcha-adapters.js';
import { createMcpSession, installFetchMock } from './helpers.js';

const websiteURL = 'https://example.com/challenge';
const siteKey = { websiteURL, websiteKey: 'public-site-key' };
const proxy = { proxyType: 'http', proxyAddress: 'proxy.example.com', proxyPort: 8080 };
const userAgent = 'Test Browser';

// 依据官方文档按产品分别准备调用输入，不通过生产 schema 反向生成测试数据。
const examples: Record<string, Record<string, unknown>> = Object.fromEntries([
  ...[
    'NORMAL_CAPTCHA',
    'IMAGE_CAPTCHA',
    'ROTATE',
    'CLICK',
    'COORDINATES',
    'DRAW_AROUND',
    'BOUNDING_BOX',
    'SLIDER_CAPTCHA',
    'RUSSIAN_CAPTCHA',
    'CHINESE_CAPTCHA',
    'NUMBER_CAPTCHA',
    'MATH_CAPTCHA'
  ].map((code) => [code, { body: 'aGVsbG8=' }]),
  ...[
    'RECAPTCHA_V2',
    'RECAPTCHA_V2_ENTERPRISE',
    'RECAPTCHA_ENTERPRISE',
    'CLOUDFLARE_TURNSTILE',
    'CAPY_PUZZLE',
    'AMAZON',
    'MTCAPTCHA',
    'FRIENDLY_CAPTCHA',
    'CUTCAPTCHA',
    'ATBCAPTCHA',
    'PROSOPO',
    'CAPTCHAFOX',
    'YIDUN_NE_CAPTCHA',
    'BINANCE',
    'HUNT',
    'BASILISK',
    'IMPERVA',
    'YANDEX_SMARTCAPTCHA'
  ].map((code) => [code, { ...siteKey }]),
  ...['RECAPTCHA_V3', 'RECAPTCHA_V3_ENTERPRISE'].map((code) => [
    code,
    { ...siteKey, minScore: 0.3 }
  ]),
  ['ARKOSE', { websiteURL, websitePublicKey: 'public-key' }],
  ['GEETEST', { websiteURL, gt: 'gt', challenge: 'fresh-challenge' }],
  ['GEETEST_V4', { websiteURL, captchaId: 'captcha-id' }],
  [
    'KEYCAPTCHA',
    {
      websiteURL,
      s_s_c_user_id: 42,
      s_s_c_session_id: 'session',
      s_s_c_web_server_sign: 'sign',
      s_s_c_web_server_sign2: 'sign2'
    }
  ],
  ['LEMIN', { websiteURL, captchaId: 'captcha-id', divId: 'captcha-div' }],
  ['TEXT', { comment: 'What is four plus one?' }],
  ['AUDIO', { body: 'YXVkaW8=' }],
  ['GRID', { body: 'Z3JpZA==', comment: 'Select all images with stairs.' }],
  ['DRAG_AND_DROP', { background: 'YmFja2dyb3VuZA==', images: ['cGFydA=='] }],
  ['CYBERSIARA', { websiteURL, SlideMasterUrlId: 'slide-id', userAgent }],
  ['DATADOME', { websiteURL, captchaUrl: 'https://example.com/captcha', userAgent, ...proxy }],
  ['TENCENT', { websiteURL, appId: 'app-id' }],
  ['VK_CAPTCHA', { image: 'aW1hZ2U=', steps: '10' }],
  ['TEMU', { image: 'aW1hZ2U=', parts: ['cGFydA=='] }],
  ['ALTCHA', { websiteURL, challengeJSON: '{"challenge":"fresh"}' }],
  ['TSPD', { websiteURL, tspdCookie: 'cookie', htmlPageBase64: 'aHRtbA==', ...proxy }],
  ['ALIBABA', { websiteURL, sceneId: 'scene-id', prefix: 'prefix' }],
  ['CUSTOM', {}]
]);

/** 所有测试购买只到达本地 mock，绝不请求真实识别或计费。 */
function setup(name = 'nex_captcha_buy', data: unknown = null) {
  const request = vi.fn().mockResolvedValue({ code: 0, data });
  const tool = createCaptchaTools({ request } as unknown as NexApiClient).find(
    (item) => item.name === name
  )!;
  return { tool, request };
}

describe('MCP CAPTCHA parameter contract', () => {
  const config = { apiHost: 'http://127.0.0.1:45536', apiKey: 'test-token', timeout: 2_000 };

  it('exposes product conditions through tools/list and validates them in both schema dialects', async () => {
    const session = await createMcpSession(config);
    try {
      const listed = await session.client.listTools();
      const published = listed.tools.find((tool) => tool.name === 'nex_captcha_buy')!.inputSchema;
      const preview = TOOLS.find((tool) => tool.name === 'nex_captcha_buy')!.inputSchema;
      for (const schema of [published, preview]) {
        expect(schema.type).toBe('object');
        expect(Object.keys(schema.properties ?? {})).toEqual([
          'productCode',
          'adapter',
          'maxTotalPrice'
        ]);
        expect(schema.required).toEqual(['productCode', 'adapter', 'maxTotalPrice']);
        expect(schema.allOf).toHaveLength(51);
      }
      expect(preview.allOf).toEqual(published.allOf);
      const conditions = published.allOf as Array<{
        if: { properties: { productCode: { const: string } }; required: string[] };
        then: { properties: { adapter: Record<string, unknown> } };
      }>;
      expect(
        conditions.map((condition) => condition.if.properties.productCode.const).sort()
      ).toEqual([...Object.keys(examples), 'TURNSTILE'].sort());
      for (const condition of conditions) {
        expect(condition.if.required).toEqual(['productCode']);
        // 内嵌元数据不会重写引用；确保不存在丢失的引用目标或混入的 schema 方言。
        expect(JSON.stringify(condition.then)).not.toMatch(
          /"\$(?:ref|defs|id|schema)"|"definitions"/
        );
      }

      const validateDraft7 = new AjvJsonSchemaValidator().getValidator(published);
      const validators = [
        (input: unknown) => validateDraft7(input).valid,
        new Ajv2020({ strict: false, allErrors: true }).compile(preview)
      ];
      const { tool, request } = setup();
      const check = (input: Record<string, unknown>, expected: boolean) => {
        expect(tool.inputSchema.safeParse(input).success, JSON.stringify(input)).toBe(expected);
        for (const validate of validators) {
          expect(validate(input), JSON.stringify(input)).toBe(expected);
        }
      };
      for (const [productCode, adapter] of Object.entries(examples)) {
        const input = { productCode, adapter, maxTotalPrice: '0.005' };
        check(input, true);
        check({ ...input, adapter: { ...adapter, unsupportedField: 'extra' } }, false);
        check(
          { ...input, adapter: { ...adapter, [Object.keys(adapter)[0] ?? 'body']: false } },
          false
        );
        if (productCode !== 'CUSTOM') {
          const incomplete = { ...adapter };
          delete incomplete[Object.keys(adapter)[0]!];
          check({ ...input, adapter: incomplete }, false);
        }
      }
      for (const [productCode, adapter, expected] of [
        ['ALTCHA', { websiteURL, challengeURL: 'https://example.com/altcha' }, true],
        ['ALTCHA', { websiteURL }, false],
        ['ALTCHA', { websiteURL, challengeURL: 'url', challengeJSON: '{}' }, false],
        ['VK_CAPTCHA', { redirectUri: 'https://example.com/redirect', userAgent, ...proxy }, true],
        ['VK_CAPTCHA', { image: 'image', steps: '5', redirectUri: 'url' }, false],
        ['TURNSTILE', { ...siteKey, action: 'login' }, true],
        ['TURNSTILE', { ...siteKey, unsupportedField: 'extra' }, false],
        ['FUTURE_PRODUCT', { futureField: { value: false } }, true]
      ] as const)
        check({ productCode, adapter, maxTotalPrice: 1 }, expected);
      for (const key of ['apiKey', 'API_KEY', 'Api-Key', 'clientKey', 'CLIENT_KEY', 'cLiEnT-kEy'])
        check(
          { productCode: 'FUTURE_PRODUCT', adapter: { [key]: 'private-key' }, maxTotalPrice: 1 },
          false
        );
      check({ adapter: {}, maxTotalPrice: 1 }, false);
      check({ productCode: '', adapter: {}, maxTotalPrice: 1 }, false);
      check({ productCode: 'CUSTOM', adapter: {}, maxTotalPrice: -1 }, false);
      check({ productCode: 'CUSTOM', adapter: {}, maxTotalPrice: 1, extra: true }, false);
      expect(request).not.toHaveBeenCalled();
    } finally {
      await session.close();
    }
  });

  it('keeps flat tools/call inputs and original alias/future product codes unchanged', async () => {
    const request = installFetchMock(
      async () => new Response(JSON.stringify({ code: 0, data: null }))
    );
    const session = await createMcpSession(config);
    try {
      for (const [productCode, adapter] of [
        ...Object.entries(examples),
        ['TURNSTILE', siteKey],
        ['FUTURE_PRODUCT', { futureField: false }]
      ]) {
        const input = { productCode, adapter, maxTotalPrice: '0.005' };
        const result = await session.client.callTool({ name: 'nex_captcha_buy', arguments: input });
        expect(result.isError).not.toBe(true);
        expect(request).toHaveBeenLastCalledWith(
          'http://127.0.0.1:45536/captcha/buy',
          expect.objectContaining({ method: 'POST', body: JSON.stringify(input) })
        );
      }
      const count = request.mock.calls.length;
      const invalid = await session.client.callTool({
        name: 'nex_captcha_buy',
        arguments: { productCode: 'GEETEST_V4', adapter: { websiteURL }, maxTotalPrice: 1 }
      });
      expect(invalid.isError).toBe(true);
      expect(request).toHaveBeenCalledTimes(count);
    } finally {
      await session.close();
      vi.unstubAllGlobals();
    }
  });

  it('makes offline schema results and errors readable through content alone', async () => {
    const session = await createMcpSession({ ...config, apiKey: '' });
    try {
      for (const arguments_ of [
        {},
        { productCode: 'ALTCHA' },
        { productCode: 'UNKNOWN_PRODUCT' }
      ]) {
        const result = CallToolResultSchema.parse(
          await session.client.callTool({
            name: 'nex_captcha_product_schema',
            arguments: arguments_
          })
        );
        const json = [...result.content]
          .reverse()
          .find((part) => part.type === 'text' && part.text.startsWith('{'));
        expect(json?.type).toBe('text');
        if (json?.type === 'text') expect(JSON.parse(json.text)).toEqual(result.structuredContent);
        expect(result.isError === true).toBe(
          'productCode' in arguments_ && arguments_.productCode === 'UNKNOWN_PRODUCT'
        );
      }
    } finally {
      await session.close();
    }
  });
});

describe('documented NexCaptcha adapters', () => {
  // 手写 Zod 契约与官方快照分别维护，字段、基础类型和必填条件发生漂移时必须失败。
  it.each(Object.keys(examples))(
    'keeps the native %s Zod contract aligned with the documentation',
    async (productCode) => {
      const schema = CAPTCHA_ADAPTER_SCHEMAS[productCode];
      expect(schema).toBeDefined();
      const json = z.toJSONSchema(schema!);
      const branches = (json.anyOf ?? [json]) as Array<{
        properties: Record<string, Record<string, unknown>>;
        required?: string[];
        additionalProperties?: boolean;
      }>;
      const { tool } = setup('nex_captcha_product_schema');
      const result = await tool.execute({ productCode });
      const documented = result.structuredContent!.adapterSchema as {
        properties: Record<string, Record<string, unknown>>;
        required?: string[];
      };
      expect(
        [...new Set(branches.flatMap((branch) => Object.keys(branch.properties)))].sort()
      ).toEqual(Object.keys(documented.properties).sort());
      for (const branch of branches) {
        expect(branch.additionalProperties).toBe(false);
        expect(branch.required ?? []).toEqual(expect.arrayContaining(documented.required ?? []));
        for (const [key, field] of Object.entries(branch.properties)) {
          expect(field.type, `${productCode}.${key}`).toBe(documented.properties[key]!.type);
          if (documented.properties[key]!.minItems !== undefined)
            expect(field.minItems).toBe(documented.properties[key]!.minItems);
          if (documented.properties[key]!.minLength !== undefined)
            expect(field.minLength).toBe(documented.properties[key]!.minLength);
        }
      }
    }
  );

  it('covers each of the fifty documented product codes', async () => {
    const { tool, request } = setup('nex_captcha_product_schema');
    const result = await tool.execute({});
    const rows = result.structuredContent!.rows as Array<{ productCode: string }>;
    expect(rows.map((row) => row.productCode).sort()).toEqual(Object.keys(examples).sort());
    expect(Object.keys(CAPTCHA_ADAPTER_SCHEMAS).sort()).toEqual(Object.keys(examples).sort());
    expect(rows).toHaveLength(50);
    expect(request).not.toHaveBeenCalled();
  });

  it.each(Object.entries(examples))(
    'forwards documented %s inputs unchanged',
    async (productCode, adapter) => {
      const { tool, request } = setup();
      const input = { productCode, adapter, maxTotalPrice: '0.005' };
      await tool.execute(input);
      expect(request).toHaveBeenCalledExactlyOnceWith('/captcha/buy', {
        method: 'POST',
        body: JSON.stringify(input)
      });
    }
  );

  it.each(Object.entries(examples).filter(([code]) => code !== 'CUSTOM'))(
    'rejects a missing required input for %s before charging',
    (productCode, adapter) => {
      const incomplete = { ...adapter };
      delete incomplete[Object.keys(adapter)[0]!];
      const { tool, request } = setup();
      expect(() => tool.execute({ productCode, adapter: incomplete, maxTotalPrice: 1 })).toThrow();
      expect(request).not.toHaveBeenCalled();
    }
  );

  it.each(Object.entries(examples))(
    'rejects undeclared fields for %s without echoing their values',
    (productCode, adapter) => {
      const { tool, request } = setup();
      let error: unknown;
      try {
        void tool.execute({
          productCode,
          adapter: { ...adapter, apiKey: 'private-api-key' },
          maxTotalPrice: 1
        });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeDefined();
      expect(String(error)).not.toContain('private-api-key');
      expect(request).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['GRID', { body: 'aW1hZ2U=' }],
    ['GRID', { body: 'aW1hZ2U=', comment: 'question', rows: 3 }],
    ['GRID', { body: 'aW1hZ2U=', comment: '' }],
    ['RECAPTCHA_V3', { ...siteKey }],
    ['RECAPTCHA_V3', { ...siteKey, minScore: '0.3' }],
    ['GEETEST_V4', { websiteURL, initParameters: { captchaId: 'id' } }],
    ['NORMAL_CAPTCHA', { body: '' }],
    ['NORMAL_CAPTCHA', { body: 'image', numeric: 1 }],
    ['NORMAL_CAPTCHA', { body: 'image', minLength: 1.5 }],
    ['DRAG_AND_DROP', { background: 'image', images: [] }],
    ['DRAG_AND_DROP', { background: 'image', images: [1] }],
    ['DATADOME', { websiteURL, captchaUrl: 'url', userAgent }],
    ['ALTCHA', { websiteURL }],
    ['ALTCHA', { websiteURL, challengeJSON: '{}', challengeURL: 'https://example.com/challenge' }],
    ['ALTCHA', { websiteURL, challengeJSON: '{}', challengeURL: '' }],
    ['VK_CAPTCHA', {}],
    ['VK_CAPTCHA', { image: 'image' }],
    ['VK_CAPTCHA', { image: 'image', steps: '5', redirectUri: 'https://example.com/redirect' }],
    ['VK_CAPTCHA', { redirectUri: 'https://example.com/redirect', userAgent }]
  ])('rejects invalid %s parameters before any purchase request', (productCode, adapter) => {
    const { tool, request } = setup();
    expect(() => tool.execute({ productCode, adapter, maxTotalPrice: 1 })).toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ['ALTCHA', { websiteURL, challengeURL: 'https://example.com/altcha' }],
    ['VK_CAPTCHA', { redirectUri: 'https://example.com/redirect', userAgent, ...proxy }],
    ['TURNSTILE', { ...siteKey, action: 'login', data: 'data', pagedata: 'page-data' }],
    ['FUTURE_PRODUCT', { futureField: { value: false } }]
  ])(
    'preserves compatible %s codes and mutually exclusive input modes',
    async (productCode, adapter) => {
      const { tool, request } = setup();
      await tool.execute({ productCode, adapter, maxTotalPrice: 1 });
      expect(JSON.parse(request.mock.calls[0]![1].body)).toEqual({
        productCode,
        adapter,
        maxTotalPrice: 1
      });
    }
  );

  it.each(['apiKey', 'clientKey', 'api_key'])(
    'does not forward %s as an adapter field even for future products',
    (key) => {
      const { tool, request } = setup();
      expect(() =>
        tool.execute({
          productCode: 'FUTURE_PRODUCT',
          adapter: { [key]: 'private-api-key' },
          maxTotalPrice: 1
        })
      ).toThrow(/Platform API keys/);
      expect(request).not.toHaveBeenCalled();
    }
  );

  it('preserves false values and all documented optional fields without applying defaults', async () => {
    const { tool, request } = setup();
    const adapter = {
      body: 'aW1hZ2U=',
      phrase: false,
      caseSensitive: false,
      numeric: false,
      math: false,
      minLength: 1,
      maxLength: 10,
      comment: 'Actual question',
      imgInstructions: 'aW5zdHJ1Y3Rpb25z'
    };
    await tool.execute({ productCode: 'NORMAL_CAPTCHA', adapter, maxTotalPrice: 1 });
    expect(JSON.parse(request.mock.calls[0]![1].body).adapter).toEqual(adapter);
  });

  it.each(['SLIDER_CAPTCHA', 'CUSTOM'])(
    'does not invent a result contract for %s',
    async (productCode) => {
      const { tool, request } = setup('nex_captcha_product_schema');
      const result = await tool.execute({ productCode });
      expect(result.structuredContent).toMatchObject({
        productCode,
        integration: { readiness: 'DOCUMENTATION_REQUIRED', resultKind: 'UNDOCUMENTED' },
        solutionExample: {}
      });
      expect(request).not.toHaveBeenCalled();
    }
  );

  it('keeps raw challenge media and credentials out of ordinary task summaries', async () => {
    const record = {
      id: 7,
      productCode: 'DATADOME',
      state: 'PROCESSING',
      price: 0.005,
      adapter: { proxyPassword: 'secret-proxy', body: 'private-image', cookies: 'private-cookie' },
      request: 'private-request',
      failure: { code: 'TASK_FAILED', nextAction: 'INSPECT_CHALLENGE', raw: 'private-provider' }
    };
    for (const name of ['nex_captcha_buy', 'nex_captcha_record_list', 'nex_captcha_query']) {
      const { tool } = setup(
        name,
        name === 'nex_captcha_record_list' ? { data: [record] } : record
      );
      const result = await tool.execute(
        name === 'nex_captcha_buy'
          ? { productCode: 'DATADOME', adapter: examples.DATADOME, maxTotalPrice: 1 }
          : name === 'nex_captcha_query'
            ? { id: 7 }
            : {}
      );
      expect(JSON.stringify(result)).not.toMatch(/private-|secret-proxy/);
      expect(JSON.stringify(result)).toContain('PROCESSING');
    }
  });
});
