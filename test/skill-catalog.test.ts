import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateSkillCatalog } from '../scripts/generate-skill-catalog.js';

const CATALOG_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../skills/nexbrowser-automation/references/tool-catalog.md'
);

/**
 * Drift test: the committed skill catalog must equal the spec-generated output.
 * Running via `pnpm gen:catalog` (detected through npm_lifecycle_event) writes
 * the file instead of comparing, so regeneration and verification share one path.
 * 漂移测试：仓库中的 skill 目录必须与规格生成结果一致。
 * 通过 `pnpm gen:catalog`（npm_lifecycle_event 识别）运行时改为写入文件，
 * 生成与校验共用同一条代码路径。
 */
describe('skill tool catalog', () => {
  it('matches the committed references/tool-catalog.md', () => {
    const generated = generateSkillCatalog();

    if (process.env.npm_lifecycle_event === 'gen:catalog') {
      writeFileSync(CATALOG_PATH, generated, 'utf8');
      return;
    }

    let committed = '';
    try {
      committed = readFileSync(CATALOG_PATH, 'utf8');
    } catch {
      throw new Error(`Skill catalog missing at ${CATALOG_PATH}. Run: pnpm gen:catalog`);
    }
    expect(
      committed.replaceAll('\r\n', '\n'),
      'tool-catalog.md has drifted from the tool specs. Run: pnpm gen:catalog'
    ).toBe(generated);
  });
});
