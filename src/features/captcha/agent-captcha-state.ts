import type { ActiveSessionStore } from '../../shared/types.js';

export interface CaptchaTaskBinding {
  contextId: string;
  productCode: string;
  url: string;
  websiteKey: string;
  challenge?: { s?: string; action?: string; data?: string; pagedata?: string; userAgent?: string };
  expiresAt: number;
  lastQueryAt?: number;
}

const bindings = new WeakMap<ActiveSessionStore, Map<number, CaptchaTaskBinding>>();

/** 只为本进程购买成功的本地任务保存原页面绑定；不保存答案或原始 HTML。 */
export function rememberCaptchaTask(
  sessions: ActiveSessionStore,
  id: number,
  contextId: string,
  productCode: string,
  adapter: Record<string, unknown>
) {
  if (typeof adapter.websiteURL !== 'string' || typeof adapter.websiteKey !== 'string') return;
  const payload = adapter.enterprisePayload;
  const challenge: NonNullable<CaptchaTaskBinding['challenge']> = {};
  const sValues = [
    adapter.recaptchaDataSValue,
    adapter.s,
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).s
      : undefined
  ].filter((value): value is string => typeof value === 'string');
  if (new Set(sValues).size > 1) return;
  if (sValues[0] !== undefined) challenge.s = sValues[0];
  if (
    typeof adapter.pageAction === 'string' &&
    typeof adapter.action === 'string' &&
    adapter.pageAction !== adapter.action
  )
    return;
  const action = adapter.pageAction ?? adapter.action;
  if (typeof action === 'string') challenge.action = action;
  for (const key of ['data', 'pagedata', 'userAgent'] as const)
    if (typeof adapter[key] === 'string') challenge[key] = adapter[key];
  let records = bindings.get(sessions);
  if (!records) bindings.set(sessions, (records = new Map()));
  for (const [key, value] of records) if (value.expiresAt < Date.now()) records.delete(key);
  if (records.size >= 256) return;
  records.set(id, {
    contextId,
    productCode,
    url: adapter.websiteURL,
    websiteKey: adapter.websiteKey,
    ...(Object.keys(challenge).length ? { challenge } : {}),
    expiresAt: Date.now() + 300_000
  });
}

export function captchaTaskBinding(sessions: ActiveSessionStore, id: number) {
  const record = bindings.get(sessions)?.get(id);
  return record && record.expiresAt > Date.now() ? record : undefined;
}

/** 片段不参与服务器挑战绑定；其余 URL 必须相同，禁止跨页面复用。 */
export function sameCaptchaUrl(left: string, right: string) {
  const a = new URL(left);
  const b = new URL(right);
  a.hash = b.hash = '';
  return a.href === b.href;
}
