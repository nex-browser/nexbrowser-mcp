import { describe, expect, it } from 'vitest';
import { TOOLS } from '../src/index.js';

function tool(name: string) {
  const found = TOOLS.find((candidate) => candidate.name === name);
  expect(found, `Expected tool ${name} to be registered`).toBeDefined();
  return found!;
}

describe('tool safety metadata', () => {
  it('publishes environment-management descriptions in English', () => {
    for (const name of [
      'nex_browser_list',
      'nex_browser_open',
      'nex_browser_connection_info',
      'nex_browser_close'
    ]) {
      expect(tool(name).description, name).not.toMatch(/[\u3400-\u9fff]/u);
    }
  });

  it('marks operations that directly close user-visible state as destructive', () => {
    expect(tool('nex_browser_close').annotations?.destructiveHint).toBe(true);
    expect(tool('nex_browser_tab_close').annotations?.destructiveHint).toBe(true);
  });

  it('does not advertise conditional or state-changing tools as read-only', () => {
    for (const name of [
      'nex_browser_console_messages',
      'nex_browser_network_requests',
      'nex_browser_handle_dialog',
      'nex_browser_evaluate',
      'nex_browser_run_code',
      'nex_browser_take_screenshot',
      'nex_browser_file_upload',
      'nex_browser_drop'
    ]) {
      expect(tool(name).annotations?.readOnlyHint, name).not.toBe(true);
    }
  });

  it('keeps page JavaScript tools visibly permission-gated', () => {
    expect(tool('nex_browser_evaluate').description).toMatch(/permission/i);
    expect(tool('nex_browser_run_code').description).toMatch(/permission/i);
  });
});
