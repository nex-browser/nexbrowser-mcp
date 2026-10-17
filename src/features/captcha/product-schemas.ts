import { z } from 'zod';
import catalogData from './captcha-products.json' with { type: 'json' };
import { CAPTCHA_ADAPTER_SCHEMAS } from './captcha-adapters.js';

interface AdapterSchema {
  type: 'object';
  properties: Record<string, z.core.JSONSchema.JSONSchema>;
  required?: string[];
  additionalProperties: false;
  oneOf?: unknown[];
  [key: string]: unknown;
}

interface ProductDefinition {
  adapterSchema: AdapterSchema;
  integration: {
    workflows: string[];
    readiness: string;
    resultKind: string;
    [key: string]: unknown;
  };
  solutionExample: Record<string, unknown>;
}

const catalog = catalogData as unknown as {
  source: { documentationUrl: string; openapiUrl: string; version: string };
  products: Record<string, ProductDefinition>;
};
const aliases: Record<string, string> = { TURNSTILE: 'CLOUDFLARE_TURNSTILE' };
const platformKeyPattern = '^(?:[aA][pP][iI]|[cC][lL][iI][eE][nN][tT])[-_]?[kK][eE][yY]$';
const platformKey = new RegExp(platformKeyPattern);

export const CAPTCHA_SCHEMA_SOURCE = catalog.source;

/** JSON Schema 和运行时共享鉴权字段规则，未来产品也不能透传平台密钥。 */
export const captchaAdapterInput = z.record(z.string(), z.unknown()).meta({
  propertyNames: { type: 'string', not: { pattern: platformKeyPattern } }
});

/**
 * 保留根 object 和既有平铺签名，SDK tools/list 与 TOOLS 预览共享产品条件。
 * 条件内容只从原生 Zod 生成；Draft 7 的内联片段同时兼容 2020-12。
 */
export function captchaProductConditions() {
  const schemas = {
    ...CAPTCHA_ADAPTER_SCHEMAS,
    ...Object.fromEntries(
      Object.entries(aliases).map(([alias, code]) => [alias, CAPTCHA_ADAPTER_SCHEMAS[code]!])
    )
  };
  return Object.entries(schemas).map(([productCode, schema]) => {
    const adapter = z.toJSONSchema(schema, {
      io: 'input',
      target: 'draft-07',
      reused: 'inline',
      cycles: 'throw'
    });
    delete adapter.$schema;
    return {
      if: { properties: { productCode: { const: productCode } }, required: ['productCode'] },
      then: { properties: { adapter } }
    };
  });
}

/** 旧 Desktop 产品编码只用于查找参数，不改写购买时使用的实时目录编码。 */
export function captchaProductDefinition(productCode: string) {
  const code = Object.hasOwn(aliases, productCode) ? aliases[productCode]! : productCode;
  if (!Object.hasOwn(catalog.products, code)) return undefined;
  return { productCode: code, ...catalog.products[code]! };
}

/** 离线目录只说明参数契约，不把文档快照误作当前启用状态或报价。 */
export function captchaProductSummaries() {
  return Object.entries(catalog.products).map(([productCode, product]) => ({
    productCode,
    required: product.adapterSchema.required ?? [],
    optional: Object.keys(product.adapterSchema.properties).filter(
      (key) => !product.adapterSchema.required?.includes(key)
    ),
    readiness: product.integration.readiness,
    resultKind: product.integration.resultKind,
    workflows: product.integration.workflows
  }));
}

/** 只校验已收录产品；未来产品仍可透传，所有值保持调用者原样且不写入错误消息。 */
export function validateCaptchaAdapter(
  productCode: string,
  adapter: Record<string, unknown>,
  context: z.RefinementCtx
) {
  if (Object.keys(adapter).some((key) => platformKey.test(key))) {
    context.addIssue({
      code: 'custom',
      path: ['adapter'],
      message:
        'Platform API keys must not be sent in adapter; authentication is managed by NexBrowser Desktop.'
    });
    return;
  }
  const product = captchaProductDefinition(productCode);
  if (!product) return;
  const validator = CAPTCHA_ADAPTER_SCHEMAS[product.productCode];
  if (!validator) throw new Error(`Missing native Zod schema for ${product.productCode}`);
  const parsed = validator.safeParse(adapter);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      context.addIssue({
        code: 'custom',
        path: ['adapter', ...issue.path],
        message: `${issue.message} See nex_captcha_product_schema for ${product.productCode}.`
      });
    }
    return;
  }
}
