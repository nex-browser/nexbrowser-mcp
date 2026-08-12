import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SKILL_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../skills/nexbrowser-automation'
);
const SKILL_PATH = resolve(SKILL_DIR, 'SKILL.md');

describe('bundled automation skill', () => {
  it('has valid discovery frontmatter', () => {
    const skill = readFileSync(SKILL_PATH, 'utf8');
    expect(skill).toMatch(/^---\r?\nname: nexbrowser-automation\r?\n/);
    expect(skill).toMatch(/\r?\ndescription: Use whenever the user explicitly names NexBrowser/);
    expect(skill).toContain('including listing or counting managed windows/environments/profiles');
    expect(skill).toContain('never generic Browser, Chrome, or computer-use tools');
  });

  it('only links to bundled markdown references', () => {
    const skill = readFileSync(SKILL_PATH, 'utf8');
    const references = [...skill.matchAll(/\(([^)]+\.md)\)/g)].map((match) => match[1]);

    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(existsSync(resolve(SKILL_DIR, reference!)), reference).toBe(true);
    }
  });

  it('documents the unified MCP server', () => {
    const readme = readFileSync(resolve(SKILL_DIR, 'README.md'), 'utf8');
    const skill = readFileSync(SKILL_PATH, 'utf8');

    expect(readme).toContain('unified NexBrowser MCP server');
    expect(skill).toContain('part of this same MCP server');
  });

  it('requires one batch open before multi-window connections', () => {
    const skill = readFileSync(SKILL_PATH, 'utf8');
    const toolSelection = readFileSync(resolve(SKILL_DIR, 'guides/tool-selection.md'), 'utf8');

    expect(skill).toContain(
      'call `nex_browser_open` exactly once with every target ID in the `windowId` array'
    );
    expect(skill).toContain('`nex_browser_connect(startIfNeeded=false)`');
    expect(skill).toContain('pass it explicitly to subsequent tools for that window');
    expect(toolSelection).toContain('call `nex_browser_open` once with all IDs');
  });
});
