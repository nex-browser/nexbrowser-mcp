import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_NEX_RESPONSE_BYTES,
  NexApiClient,
  NexConfigurationError,
  normalizeNexApiHost,
  resolveNexApiConfig
} from '../src/index.js';
import { installFetchMock } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('NexApiClient', () => {
  it('uses the default NexBrowser OpenAPI host', () => {
    expect(resolveNexApiConfig({})).toMatchObject({
      apiHost: 'http://127.0.0.1:45536',
      apiKey: '',
      timeout: 30_000,
      exposeCdp: false
    });
  });

  it('normalizes environment whitespace and invalid timeouts', () => {
    vi.stubEnv('NEX_API_HOST', ' http://127.0.0.1:45536/ ');
    vi.stubEnv('NEX_API_KEY', ' token ');
    vi.stubEnv('NEX_TIMEOUT', 'not-a-number');

    // Only whitespace is trimmed here: the trailing slash stays in the config
    // and is stripped later when the request URL is built.
    // 此处仅去除首尾空白：结尾斜杠保留在配置中，构造请求 URL 时才会剥离。
    expect(resolveNexApiConfig()).toEqual({
      apiHost: 'http://127.0.0.1:45536/',
      apiKey: 'token',
      timeout: 30_000,
      exposeCdp: false
    });
  });

  it('applies CLI overrides above environment values and defaults', () => {
    const env = {
      NEX_API_HOST: 'https://env-host.example:1',
      NEX_API_KEY: 'env-key',
      NEX_TIMEOUT: '1000'
    } as NodeJS.ProcessEnv;

    expect(
      resolveNexApiConfig(env, {
        apiHost: 'https://cli-host.example:2',
        apiKey: 'cli-key',
        timeout: 2_000
      })
    ).toEqual({
      apiHost: 'https://cli-host.example:2',
      apiKey: 'cli-key',
      timeout: 2_000,
      exposeCdp: false
    });

    // Empty/undefined overrides fall back to the environment, then defaults.
    // 空白/未传的 override 依次回退到环境变量与默认值。
    expect(resolveNexApiConfig(env, { apiKey: '' })).toEqual({
      apiHost: 'https://env-host.example:1',
      apiKey: 'env-key',
      timeout: 1_000,
      exposeCdp: false
    });
    expect(resolveNexApiConfig({}, {})).toMatchObject({
      apiHost: 'http://127.0.0.1:45536',
      apiKey: '',
      timeout: 30_000,
      exposeCdp: false
    });
  });

  it('keeps each client identity stable and adds authenticated request headers', async () => {
    const fetchMock = installFetchMock(
      async () => new Response(JSON.stringify({ code: 0, msg: 'ok', data: {} }))
    );
    const first = new NexApiClient({
      apiHost: 'http://127.0.0.1:45536',
      apiKey: 'test-token',
      timeout: 2_000
    });
    const second = new NexApiClient({
      apiHost: 'http://127.0.0.1:45536',
      apiKey: 'test-token',
      timeout: 2_000
    });

    await first.request('/one');
    await first.request('/two');
    await second.request('/three');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const firstHeaders = new Headers(fetchMock.mock.calls.at(0)?.[1]?.headers);
    const secondHeaders = new Headers(fetchMock.mock.calls.at(1)?.[1]?.headers);
    const thirdHeaders = new Headers(fetchMock.mock.calls.at(2)?.[1]?.headers);
    expect(firstHeaders.get('Authorization')).toBe('Bearer test-token');
    expect(firstHeaders.get('X-Nex-Client-Id')).toBe(secondHeaders.get('X-Nex-Client-Id'));
    expect(firstHeaders.get('X-Nex-Client-Id')).not.toBe(thirdHeaders.get('X-Nex-Client-Id'));
    expect(firstHeaders.has('token')).toBe(false);
    expect(fetchMock.mock.calls.at(0)?.[1]?.redirect).toBe('error');
  });

  it('allows local HTTP and remote HTTPS origins but rejects unsafe API hosts', () => {
    expect(normalizeNexApiHost('http://127.0.0.1:45536/')).toBe('http://127.0.0.1:45536');
    expect(normalizeNexApiHost('http://[::1]:45536')).toBe('http://[::1]:45536');
    expect(normalizeNexApiHost('https://openapi.example.com')).toBe('https://openapi.example.com');

    for (const unsafe of [
      'http://attacker.example',
      'ftp://127.0.0.1:45536',
      'https://user:pass@example.com',
      'https://example.com/proxy',
      'not-a-url'
    ]) {
      expect(() => normalizeNexApiHost(unsafe)).toThrow(NexConfigurationError);
    }
  });

  it('does not let callers replace authentication headers', async () => {
    const fetchMock = installFetchMock(
      async () => new Response(JSON.stringify({ code: 0, msg: 'ok' }))
    );
    const client = new NexApiClient({
      apiHost: 'http://127.0.0.1:45536',
      apiKey: 'trusted-token',
      timeout: 2_000
    });

    await client.request('/test', {
      headers: { Authorization: 'Bearer attacker-token', 'X-Nex-Client-Id': 'attacker-client' }
    });
    const headers = new Headers(fetchMock.mock.calls.at(0)?.[1]?.headers);
    expect(headers.get('Authorization')).toBe('Bearer trusted-token');
    expect(headers.get('X-Nex-Client-Id')).toBe(client.clientId);
  });

  it('rejects oversized responses before reading their body', async () => {
    installFetchMock(
      async () =>
        new Response('{}', {
          headers: { 'content-length': String(MAX_NEX_RESPONSE_BYTES + 1) }
        })
    );
    const client = new NexApiClient({
      apiHost: 'http://127.0.0.1:45536',
      apiKey: 'test-token',
      timeout: 2_000
    });

    await expect(client.request('/large')).rejects.toThrow('OpenAPI response exceeds');
  });

  it('does not include a raw non-JSON response body in errors', async () => {
    installFetchMock(async () => new Response('sensitive backend details', { status: 502 }));
    const client = new NexApiClient({
      apiHost: 'http://127.0.0.1:45536',
      apiKey: 'test-token',
      timeout: 2_000
    });

    await expect(client.request('/bad')).rejects.not.toThrow('sensitive backend details');
  });
});
