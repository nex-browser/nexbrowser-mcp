import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esm = await import('../lib/index.js');
const cjs = require('../lib/index.cjs');

for (const loaded of [esm, cjs]) {
  assert.equal(loaded.MCP_SERVER_NAME, 'nexbrowser-mcp');
  assert.equal(loaded.MCP_SERVER_VERSION, loaded.PKG_VERSION);
  assert.equal(loaded.TOOLS.length, 98);
  for (const name of [
    'nex_ip_buy',
    'nex_mail_buy',
    'nex_captcha_query',
    'nex_captcha_product_schema',
    'nex_billing_trade_list'
  ]) {
    assert.ok(loaded.TOOLS.some((tool) => tool.name === name));
  }
  assert.equal(
    loaded.TOOLS.find((tool) => tool.name === 'nex_captcha_product_schema').annotations
      .readOnlyHint,
    true
  );
  assert.deepEqual(
    Object.keys(loaded.TOOLS.find((tool) => tool.name === 'nex_mail_buy').inputSchema.properties),
    ['type', 'durationHours', 'domainId', 'suffix']
  );
  const mailPolling = loaded.TOOLS.find(
    (tool) => tool.name === 'nex_mail_message_list'
  ).inputSchema;
  assert.equal(mailPolling.properties.waitSeconds.maximum, 180);
  assert.equal(mailPolling.properties.waitSeconds.default, 0);
  assert.equal(mailPolling.properties.onlyNew.default, false);
  assert.ok(mailPolling.properties.receivedAfter);
  assert.equal(typeof loaded.NexBrowserMCPServer, 'function');

  // Exercise the bundled free application tool with loopback-only service data;
  // a serialized page function must not depend on bundler-local helpers.
  const productCode = 'RECAPTCHA_V2';
  const adapter = { websiteURL: 'https://fixture.test/login', websiteKey: 'fixture-key' };
  const api = {
    async request(route) {
      const data =
        route === '/captcha/schema'
          ? {
              productCode,
              schema: { type: 'object' },
              integration: {
                readiness: 'READY',
                workflows: ['BROWSER_RESULT'],
                resultKind: 'TOKEN',
                resultSchema: { type: 'object', properties: { token: { type: 'string' } } }
              }
            }
          : {
              id: 1,
              productCode,
              state: route === '/captcha/buy' ? 'CREATED' : 'SUCCEEDED',
              solution: { token: 'fixture-token' }
            };
      assert.ok(['/captcha/schema', '/captcha/buy', '/captcha/query'].includes(route));
      return { code: 0, contextId: 'fixture-team', data };
    }
  };
  const tools = loaded.createCaptchaTools(api);
  await tools
    .find((tool) => tool.name === 'nex_captcha_buy')
    .execute({ productCode, adapter, workflow: 'BROWSER_RESULT' });
  const result = await tools
    .find((tool) => tool.name === 'nex_captcha_apply_result')
    .execute({ id: 1, url: adapter.websiteURL, websiteKey: adapter.websiteKey });
  assert.notEqual(result.isError, true);
  const expression = result.structuredContent.apply.javascript;
  assert.equal(typeof expression, 'string');
  assert.throws(
    () =>
      vm.runInNewContext(expression, {
        URL,
        window: {
          location: { href: adapter.websiteURL },
          document: { querySelectorAll: () => [] },
          Element: class {}
        }
      }),
    /CAPTCHA widget is missing/
  );
}

await access(path.join(root, 'skills/nexbrowser-automation/SKILL.md'));
const cli = spawnSync(process.execPath, ['lib/cli.js', '--version'], {
  cwd: root,
  encoding: 'utf8'
});
assert.equal(cli.status, 0, cli.stderr);
assert.equal(cli.stdout.trim(), esm.PKG_VERSION);

console.log(`Runtime smoke passed on Node ${process.version} for ESM, CommonJS, CLI, and Skills.`);
