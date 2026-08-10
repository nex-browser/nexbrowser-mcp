import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esm = await import('../lib/index.js');
const cjs = require('../lib/index.cjs');

for (const loaded of [esm, cjs]) {
  assert.equal(loaded.MCP_SERVER_NAME, 'nexbrowser-mcp');
  assert.equal(loaded.MCP_SERVER_VERSION, loaded.PKG_VERSION);
  assert.equal(loaded.TOOLS.length, 41);
  assert.equal(typeof loaded.NexBrowserMCPServer, 'function');
}

await access(path.join(root, 'skills/nexbrowser-automation/SKILL.md'));
const cli = spawnSync(process.execPath, ['lib/cli.js', '--version'], {
  cwd: root,
  encoding: 'utf8'
});
assert.equal(cli.status, 0, cli.stderr);
assert.equal(cli.stdout.trim(), esm.PKG_VERSION);

console.log(`Runtime smoke passed on Node ${process.version} for ESM, CommonJS, CLI, and Skill.`);
