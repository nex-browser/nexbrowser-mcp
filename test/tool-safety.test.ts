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
      'nex_list_browsers',
      'nex_open_browsers',
      'nex_get_connection_info',
      'nex_close_browsers'
    ]) {
      expect(tool(name).description, name).not.toMatch(/[\u3400-\u9fff]/u);
    }
  });

  it('marks operations that directly close user-visible state as destructive', () => {
    expect(tool('nex_close_browsers').annotations?.destructiveHint).toBe(true);
    expect(tool('browser_tab_close').annotations?.destructiveHint).toBe(true);
  });

  it('does not advertise conditional or state-changing tools as read-only', () => {
    for (const name of [
      'browser_console_messages',
      'browser_network_requests',
      'browser_handle_dialog',
      'browser_evaluate',
      'browser_run_code',
      'browser_take_screenshot',
      'browser_file_upload',
      'browser_drop'
    ]) {
      expect(tool(name).annotations?.readOnlyHint, name).not.toBe(true);
    }
  });

  it('keeps page JavaScript tools visibly permission-gated', () => {
    expect(tool('browser_evaluate').description).toMatch(/permission/i);
    expect(tool('browser_run_code').description).toMatch(/permission/i);
  });
});
