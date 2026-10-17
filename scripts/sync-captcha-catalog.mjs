import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/sync-captcha-catalog.mjs <official-openapi.json>');
const source = JSON.parse(readFileSync(input, 'utf8'));
if (source.info?.title !== 'Nex Captcha OpenAPI') throw new Error('Unexpected OpenAPI document');

/** Retain documented schema constraints, excluding documentation-server localization metadata. */
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.startsWith('x-'))
      .map(([key, item]) => [key, clean(item)])
  );
}

const products = Object.fromEntries(
  Object.entries(source.components?.schemas ?? {})
    .filter(([name]) => name.startsWith('Adapter_'))
    .map(([name, schema]) => {
      if (
        schema.type !== 'object' ||
        schema.additionalProperties !== false ||
        !schema['x-integration']
      )
        throw new Error(`Missing product contract: ${name}`);
      return [
        name.slice('Adapter_'.length),
        {
          adapterSchema: clean(schema),
          integration: schema['x-integration'],
          solutionExample: schema['x-solution-example'] ?? {}
        }
      ];
    })
);
if (!Object.keys(products).length) throw new Error('No product schemas found');
const catalog = {
  source: {
    documentationUrl: 'https://app.nexcaptcha.net/openapi/docs.cgi?lang=zh-CN',
    openapiUrl: 'https://app.nexcaptcha.net/openapi/nexcaptcha-openapi.json',
    version: source.info.version
  },
  products
};
const destination = fileURLToPath(
  new URL('../src/features/captcha/captcha-products.json', import.meta.url)
);
writeFileSync(
  destination,
  await format(JSON.stringify(catalog), { ...(await resolveConfig(destination)), parser: 'json' })
);
console.info(
  `Updated ${Object.keys(products).length} NexCaptcha product contracts from OpenAPI ${source.info.version}.`
);
