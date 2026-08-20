import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'nexbrowser-mcp-package-smoke-'));
const consumerRoot = path.join(temporaryRoot, 'consumer');
const installer = process.env.PACKAGE_SMOKE_INSTALLER ?? 'pnpm';
const npm12Version = '12.0.2';

assert.ok(
  installer === 'pnpm' || installer === 'npm12',
  `Unsupported PACKAGE_SMOKE_INSTALLER: ${installer}`
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    shell: options.shell ?? false
  });
  assert.equal(
    result.status,
    0,
    [`Command failed: ${command} ${args.join(' ')}`, result.stdout, result.stderr]
      .filter(Boolean)
      .join('\n')
  );
  return result.stdout.trim();
}

function runPnpm(args, options) {
  const pnpmScript = process.env.npm_execpath;
  if (pnpmScript) return run(process.execPath, [pnpmScript, ...args], options);
  return run('pnpm', args, options);
}

function installTarball(tarball) {
  if (installer === 'npm12') {
    return run('npx', ['--yes', `npm@${npm12Version}`, 'install', tarball], {
      cwd: consumerRoot,
      shell: process.platform === 'win32'
    });
  }

  return runPnpm(['add', '--ignore-scripts', tarball], { cwd: consumerRoot });
}

try {
  const packOutput = runPnpm(['pack', '--json', '--pack-destination', temporaryRoot]);
  const packResult = JSON.parse(packOutput);
  const filename = Array.isArray(packResult) ? packResult[0]?.filename : packResult.filename;
  assert.equal(typeof filename, 'string', `Unexpected pnpm pack output: ${packOutput}`);
  const tarball = path.isAbsolute(filename) ? filename : path.join(root, filename);

  await mkdir(consumerRoot, { recursive: true });
  await writeFile(
    path.join(consumerRoot, 'package.json'),
    JSON.stringify({ private: true, name: 'nexbrowser-mcp-smoke-host' }),
    'utf8'
  );
  installTarball(tarball);
  await writeFile(
    path.join(consumerRoot, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
    'utf8'
  );

  const esmScript = `
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as mcp from '@nexbrowser/mcp';
assert.equal(mcp.MCP_SERVER_NAME, 'nexbrowser-mcp');
assert.equal(mcp.MCP_SERVER_VERSION, mcp.PKG_VERSION);
assert.equal(mcp.TOOLS.length, 64);
assert.equal(typeof mcp.NexBrowserMCPServer, 'function');
const embeddedServer = new mcp.NexBrowserMCPServer();
assert.equal(typeof embeddedServer.connect, 'function');
assert.equal(typeof embeddedServer.close, 'function');
await embeddedServer.close();
const entry = fileURLToPath(import.meta.resolve('@nexbrowser/mcp'));
await access(path.resolve(entry, '../../skills/nexbrowser-automation/SKILL.md'));
`;
  const cjsScript = `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mcp = require('@nexbrowser/mcp');
void (async () => {
assert.equal(mcp.MCP_SERVER_NAME, 'nexbrowser-mcp');
assert.equal(mcp.MCP_SERVER_VERSION, mcp.PKG_VERSION);
assert.equal(mcp.TOOLS.length, 64);
assert.equal(typeof mcp.NexBrowserMCPServer, 'function');
const embeddedServer = new mcp.NexBrowserMCPServer();
assert.equal(typeof embeddedServer.connect, 'function');
assert.equal(typeof embeddedServer.close, 'function');
await embeddedServer.close();
fs.accessSync(path.resolve(require.resolve('@nexbrowser/mcp'), '../../skills/nexbrowser-automation/SKILL.md'));
})().catch((error) => { console.error(error); process.exitCode = 1; });
`;
  await writeFile(path.join(consumerRoot, 'esm-smoke.mjs'), esmScript, 'utf8');
  await writeFile(path.join(consumerRoot, 'cjs-smoke.cjs'), cjsScript, 'utf8');

  run(process.execPath, ['esm-smoke.mjs'], { cwd: consumerRoot });
  run(process.execPath, ['cjs-smoke.cjs'], { cwd: consumerRoot });

  const installedRoot = path.join(consumerRoot, 'node_modules/@nexbrowser/mcp');
  const installedPackage = JSON.parse(
    await readFile(path.join(installedRoot, 'package.json'), 'utf8')
  );
  assert.equal(installedPackage.bin?.['nexbrowser-mcp'], 'lib/cli.js');
  const cliVersion = run(
    process.execPath,
    [path.join(installedRoot, installedPackage.bin['nexbrowser-mcp']), '--version'],
    {
      cwd: consumerRoot
    }
  );
  assert.equal(cliVersion, installedPackage.version);

  const installerLabel = installer === 'npm12' ? `npm@${npm12Version}` : 'pnpm';
  console.log(
    `Packed tarball smoke passed with ${installerLabel} for temporary install, ESM, CommonJS, CLI, and Skill.`
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
