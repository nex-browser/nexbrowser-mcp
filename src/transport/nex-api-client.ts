import { randomUUID } from 'node:crypto';
import { NexConfigurationError, type NexApiConfig, type NexApiResponse } from '../shared/types.js';

/** Local NexBrowser OpenAPI address used when NEX_API_HOST/--api-host is absent. 未提供 NEX_API_HOST/--api-host 时使用的本地 NexBrowser OpenAPI 地址。 */
export const DEFAULT_NEX_API_HOST = 'http://127.0.0.1:45536';
/** Per-request timeout in milliseconds when NEX_TIMEOUT/--timeout is absent. 未提供 NEX_TIMEOUT/--timeout 时的单请求超时（毫秒）。 */
export const DEFAULT_NEX_TIMEOUT = 30_000;
/** Maximum accepted OpenAPI response body. */
export const MAX_NEX_RESPONSE_BYTES = 32 * 1024 * 1024;

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' || normalized === '::1' || /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

/**
 * Accepts HTTPS origins and local loopback HTTP origins only. Credentials,
 * paths, queries, and fragments are rejected so authenticated requests cannot
 * be redirected through an attacker-controlled base URL.
 */
export function normalizeNexApiHost(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new NexConfigurationError('API host must be a valid absolute URL.');
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new NexConfigurationError(
      'API host must be an origin without credentials, path, query, or fragment.'
    );
  }
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && isLoopbackHostname(url.hostname))
  ) {
    throw new NexConfigurationError('API host must use HTTPS, except for HTTP loopback addresses.');
  }
  return url.origin;
}

async function readBoundedResponse(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_NEX_RESPONSE_BYTES) {
    throw new Error(`OpenAPI response exceeds ${MAX_NEX_RESPONSE_BYTES} bytes.`);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_NEX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(`OpenAPI response exceeds ${MAX_NEX_RESPONSE_BYTES} bytes.`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * Returns a positive timeout in milliseconds, falling back for malformed values.
 * 返回正数毫秒超时；配置格式错误时回退默认值。
 */
function resolveTimeout(value: string | number | undefined): number {
  const timeout = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_NEX_TIMEOUT;
}

/**
 * Resolves Nex API configuration with explicit overrides taking precedence over
 * environment variables (CLI > env > default).
 * 解析 Nex API 配置；显式 overrides 优先于环境变量（CLI > 环境变量 > 默认值），
 * 空值回退到默认配置。
 */
export function resolveNexApiConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<NexApiConfig> = {}
): NexApiConfig {
  return {
    apiHost: overrides.apiHost?.trim() || env.NEX_API_HOST?.trim() || DEFAULT_NEX_API_HOST,
    apiKey: overrides.apiKey?.trim() || env.NEX_API_KEY?.trim() || '',
    timeout: resolveTimeout(overrides.timeout ?? env.NEX_TIMEOUT),
    exposeCdp:
      overrides.exposeCdp ?? ['1', 'true', 'yes'].includes(env.NEX_EXPOSE_CDP?.toLowerCase() ?? '')
  };
}

/**
 * Sends authenticated, timeout-protected requests to Nex local OpenAPI.
 * 对 Nex 本地 OpenAPI 发起经过认证和超时保护的请求。
 */
export class NexApiClient {
  /** Sent as X-Nex-MCP-Client on every request so the server scopes session ownership per client. 随每个请求以 X-Nex-MCP-Client 头上报，服务端据此按客户端隔离会话归属。 */
  readonly clientId: string;
  private activeSessionId?: string;

  /**
   * Normalizes and stores connection configuration isolated to this MCP process;
   * a blank host or invalid timeout falls back to the defaults.
   * 规范化并保存当前 MCP 进程独享的连接配置；主机为空或超时非法时回退默认值。
   */
  constructor(config: NexApiConfig = resolveNexApiConfig(), clientId = randomUUID()) {
    this.config = {
      apiHost: normalizeNexApiHost(config.apiHost.trim() || DEFAULT_NEX_API_HOST),
      apiKey: config.apiKey.trim(),
      timeout: resolveTimeout(config.timeout),
      exposeCdp: config.exposeCdp === true
    };
    this.clientId = clientId;
  }

  private readonly config: NexApiConfig;

  /** Whether management results may include raw CDP endpoints. */
  get exposeCdp(): boolean {
    return this.config.exposeCdp === true;
  }

  /**
   * Calls a Nex command path and returns its raw response envelope. Throws
   * NexConfigurationError when the API key is missing, aborts after the
   * configured timeout, and surfaces non-JSON bodies as HTTP errors.
   * 调用一个 Nex command path 并返回服务端原始包络。缺少 API key 时抛出
   * NexConfigurationError，超过配置超时后中断请求，非 JSON 响应体转为 HTTP 错误。
   */
  async request<T = unknown>(path: string, options: RequestInit = {}): Promise<NexApiResponse<T>> {
    if (!this.config.apiKey.trim()) {
      throw new NexConfigurationError('API key is required. Set NEX_API_KEY or pass --api-key.');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);
    try {
      const headers = new Headers(options.headers);
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      headers.set('token', this.config.apiKey);
      headers.set('X-Nex-MCP-Client', this.clientId);
      const response = await fetch(`${this.config.apiHost}${path}`, {
        ...options,
        headers,
        redirect: 'error',
        signal: controller.signal
      });
      const text = await readBoundedResponse(response);
      try {
        return JSON.parse(text) as NexApiResponse<T>;
      } catch {
        throw new Error(
          `HTTP ${response.status}: ${response.statusText} returned a non-JSON response.`
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Releases all automation sessions owned by this client during graceful
   * shutdown; best-effort, so server or network failures are swallowed.
   * 在优雅关闭时释放当前客户端持有的所有自动化会话；尽力而为，服务端或网络失败会被吞掉。
   */
  async close(): Promise<void> {
    await this.request('/ai/browser/sessions', { method: 'DELETE' }).catch(() => undefined);
    this.activeSessionId = undefined;
  }

  /**
   * Remembers the most recent session as the default for automation tools
   * called without an explicit sessionId.
   * 记录最近连接的会话，作为未显式传 sessionId 的自动化工具的默认会话。
   */
  setActiveSessionId(sessionId: string | undefined): void {
    this.activeSessionId = sessionId;
  }

  /**
   * Returns this client's active session without sharing it across MCP processes.
   * 返回当前客户端的活动会话，且不在 MCP 进程之间共享。
   */
  getActiveSessionId(): string | undefined {
    return this.activeSessionId;
  }
}
