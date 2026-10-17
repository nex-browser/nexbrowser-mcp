import { describe, expect, it, vi } from 'vitest';
import {
  errorResult,
  MAX_MCP_STRUCTURED_BYTES,
  MAX_MCP_TEXT_CHARS,
  successResult
} from '../src/shared/tool-result.js';
import type { McpContent, McpToolResult } from '../src/shared/types.js';

function jsonCopy(result: McpToolResult): unknown {
  const content = result.content.at(-1);
  expect(content?.type).toBe('text');
  if (content?.type !== 'text') throw new Error('Missing JSON text content');
  expect(content.text.length).toBeLessThanOrEqual(MAX_MCP_TEXT_CHARS);
  const parsed: unknown = JSON.parse(content.text);
  expect(parsed).toEqual(result.structuredContent);
  return parsed;
}

describe.each([
  { name: 'successResult', wrap: successResult, isError: undefined },
  { name: 'errorResult', wrap: errorResult, isError: true }
])('$name structured output compatibility', ({ wrap, isError }) => {
  it('preserves the summary and exposes the same complete JSON value in both channels', () => {
    const data = {
      rows: [{ value: 'Quoted "text"\n中文', enabled: false }],
      count: 1,
      next: null
    };
    const result = wrap('Original summary', data);

    expect(result.content[0]).toEqual({ type: 'text', text: 'Original summary' });
    expect(result.content).toHaveLength(2);
    expect(result.structuredContent).toEqual(data);
    expect(jsonCopy(result)).toEqual(data);
    expect(result.isError).toBe(isError);
  });

  it('does not add JSON text or structured content when no data was supplied', () => {
    const result = wrap('No structured data');

    expect(result.content).toEqual([{ type: 'text', text: 'No structured data' }]);
    expect(result).not.toHaveProperty('structuredContent');
    expect(result.isError).toBe(isError);
  });

  it('preserves an empty structured object', () => {
    const result = wrap('Empty', {});

    expect(result.structuredContent).toEqual({});
    expect(jsonCopy(result)).toEqual({});
  });

  it('keeps a JSON copy at the text limit complete and parseable', () => {
    const overhead = JSON.stringify({ value: '' }).length;
    const data = { value: 'x'.repeat(MAX_MCP_TEXT_CHARS - overhead) };
    const result = wrap('At limit', data);

    expect(result.structuredContent).toEqual(data);
    expect(jsonCopy(result)).toEqual(data);
  });

  it('uses the same omission object when JSON fits the byte limit but exceeds the text limit', () => {
    const data = { value: 'x'.repeat(MAX_MCP_TEXT_CHARS) };
    expect(Buffer.byteLength(JSON.stringify(data), 'utf8')).toBeLessThan(MAX_MCP_STRUCTURED_BYTES);

    const result = wrap('Original summary', data);

    expect(result.content[0]).toEqual({ type: 'text', text: 'Original summary' });
    expect(jsonCopy(result)).toEqual({
      omitted: true,
      reason: `Structured content exceeds ${MAX_MCP_TEXT_CHARS} characters for the JSON text copy.`
    });
    expect(result.isError).toBe(isError);
  });

  it('preserves the UTF-8 byte limit independently of the text character limit', () => {
    const data = { value: '界'.repeat(700_000) };
    const serialized = JSON.stringify(data);
    expect(serialized.length).toBeLessThan(MAX_MCP_TEXT_CHARS);
    expect(Buffer.byteLength(serialized, 'utf8')).toBeGreaterThan(MAX_MCP_STRUCTURED_BYTES);

    expect(jsonCopy(wrap('Large', data))).toEqual({
      omitted: true,
      reason: `Structured content exceeds ${MAX_MCP_STRUCTURED_BYTES} bytes.`
    });
  });

  it('continues bounding the human summary without truncating the JSON copy', () => {
    const result = wrap('x'.repeat(MAX_MCP_TEXT_CHARS + 1), { count: 1 });

    expect(result.content[0]).toEqual({
      type: 'text',
      text: `${'x'.repeat(MAX_MCP_TEXT_CHARS)}\n[Output truncated at ${MAX_MCP_TEXT_CHARS} characters]`
    });
    expect(jsonCopy(result)).toEqual({ count: 1 });
  });

  it('safely replaces circular input with the same serializable omission object', () => {
    const data: Record<string, unknown> = {};
    data.self = data;

    expect(jsonCopy(wrap('Circular', data))).toEqual({
      omitted: true,
      reason: 'Structured content is not JSON serializable.'
    });
  });

  it('safely replaces BigInt input with the same serializable omission object', () => {
    expect(jsonCopy(wrap('BigInt', { value: BigInt(1) }))).toEqual({
      omitted: true,
      reason: 'Structured content is not JSON serializable.'
    });
  });

  it('handles throwing getters without leaking their error into the result', () => {
    const data = {
      get value(): string {
        throw new Error('Sensitive serialization error');
      }
    };
    const result = wrap('Getter', data);

    expect(jsonCopy(result)).toEqual({
      omitted: true,
      reason: 'Structured content is not JSON serializable.'
    });
    expect(JSON.stringify(result)).not.toContain('Sensitive serialization error');
  });

  it('serializes custom toJSON only once and retains that value in both channels', () => {
    const toJSON = vi.fn().mockReturnValueOnce({ count: 1 }).mockReturnValue({ count: 2 });
    const result = wrap('Custom serialization', { toJSON });

    expect(toJSON).toHaveBeenCalledTimes(1);
    expect(jsonCopy(result)).toEqual({ count: 1 });
    expect(JSON.stringify(result.structuredContent)).toBe('{"count":1}');
    expect(toJSON).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, [], 'scalar', 1, false])(
    'protects the MCP object contract when toJSON returns %j',
    (value) => {
      const result = wrap('Invalid root', { toJSON: () => value });

      expect(jsonCopy(result)).toEqual({
        omitted: true,
        reason:
          value === undefined
            ? 'Structured content is not JSON serializable.'
            : 'Structured content must serialize to a JSON object.'
      });
    }
  );

  it('applies normal JSON semantics consistently to optional values and dates', () => {
    const result = wrap('JSON semantics', {
      optional: undefined,
      callback: () => undefined,
      values: [undefined, NaN, Infinity],
      date: new Date('2026-10-17T00:00:00.000Z')
    });

    expect(jsonCopy(result)).toEqual({
      values: [null, null, null],
      date: '2026-10-17T00:00:00.000Z'
    });
  });
});

describe('successResult rich content compatibility', () => {
  it('keeps existing rich content in place and appends the JSON copy after it', () => {
    const image: McpContent = { type: 'image', mimeType: 'image/png', data: 'cG5n' };
    const extraText: McpContent = { type: 'text', text: 'Existing artifact description' };
    const extraContent = [image, extraText];
    const result = successResult('Original summary', { artifactCount: 1 }, extraContent);

    expect(result.content.slice(0, 3)).toEqual([
      { type: 'text', text: 'Original summary' },
      image,
      extraText
    ]);
    expect(result.content[1]).toBe(image);
    expect(extraContent).toEqual([image, extraText]);
    expect(jsonCopy(result)).toEqual({ artifactCount: 1 });
  });

  it('keeps rich content unchanged when no structured data was supplied', () => {
    const image: McpContent = { type: 'image', mimeType: 'image/png', data: 'cG5n' };

    expect(successResult('Image', undefined, [image]).content).toEqual([
      { type: 'text', text: 'Image' },
      image
    ]);
  });
});
