import type { NexApiRequester, NexApiResponse } from '../../shared/types.js';
import { SMS_PULL_ROUTE } from '../../transport/routes.js';

const SMS_POLL_INTERVAL_MS = 5_000;

const STATE_LABELS: Record<string, string> = {
  '0': 'waiting for SMS',
  '1': 'SMS received',
  '2': 'expired',
  '-1': 'refunded'
};

interface SmsMessage {
  code?: string;
  sms?: string;
  from?: string;
  time?: string;
}

/**
 * The backend stores messages as a JSON string that may itself be JSON-encoded
 * twice; newest first, matching the Desktop page.
 * 后端以 JSON 字符串保存短信，可能被二次编码；按时间倒序，与桌面端页面一致。
 */
function parseSmsMessages(raw: unknown): SmsMessage[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const list = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
    if (!Array.isArray(list)) return [];
    return list
      .map((item: any) => ({
        code: item?.code ? String(item.code) : undefined,
        sms: item?.sms ?? item?.content ?? item?.message,
        from: item?.fromNum ?? item?.from,
        time: item?.smsTime ?? item?.receivedAt ?? item?.time ?? item?.createdAt
      }))
      .sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime());
  } catch {
    return [];
  }
}

/** Projects one backend record onto the fields an agent needs. 将后端记录投影为 agent 需要的字段。 */
export function recordView(record: any) {
  const messages = parseSmsMessages(record?.message);
  const state =
    record?.state === undefined || record?.state === null ? undefined : Number(record.state);
  return {
    tel: record?.tel,
    orderNo: record?.orderNo,
    countryId: record?.countryId,
    countryName: record?.countryName,
    projectId: record?.projectId,
    projectName: record?.projectName || record?.appName,
    price: record?.discountPrice ?? record?.price,
    state,
    stateLabel: state === undefined ? undefined : STATE_LABELS[String(state)],
    expireTime: record?.expireTime,
    code: messages.find((message) => message.code)?.code,
    messages
  };
}

/**
 * List rows keep only the message count; full SMS bodies are fetched per number
 * with nex_sms_code_get.
 * 列表只保留短信数量，完整短信内容按号码用 nex_sms_code_get 读取。
 */
export function recordSummary(record: any) {
  const { messages, ...summary } = recordView(record);
  return { ...summary, messageCount: messages.length };
}

/** Renders one record for the text result. 渲染单条记录的文本结果。 */
export function recordLine(view: Omit<ReturnType<typeof recordView>, 'messages'>): string {
  return [
    `- ${view.tel} | ${view.projectName ?? '-'} / ${view.countryName ?? '-'}`,
    `  State: ${view.stateLabel ?? view.state ?? '-'}${view.code ? ` | Code: ${view.code}` : ''}`,
    `  Expires: ${view.expireTime ?? '-'} | Order: ${view.orderNo ?? '-'}`
  ].join('\n');
}

/** Discounted price wins when present, as on the Desktop page. 与桌面端一致，优先取优惠价。 */
export function payableUnitPrice(project: any): number | undefined {
  for (const value of [project?.discountPrice, project?.price]) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

/** Pulls the latest SMS of one number. 拉取单个号码的最新短信。 */
async function pull(api: NexApiRequester, tel: string, contextId?: string) {
  return api.request<any>(SMS_PULL_ROUTE, {
    method: 'POST',
    body: JSON.stringify({ tel }),
    ...(contextId ? { headers: { 'X-Nex-Service-Context': contextId } } : {})
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type CodeWaitResult =
  { ok: true; view: ReturnType<typeof recordView> } | { ok: false; response: NexApiResponse };

/**
 * Polls one number until a usable code arrives, the number leaves the waiting
 * state, or waitSeconds elapses. With onlyNew, codes already present on the
 * first pull are ignored so a resent code is not confused with an old one.
 * 轮询单个号码，直到拿到可用验证码、号码离开等待状态或超时。
 * onlyNew 时忽略首次拉取已存在的验证码，避免把旧码当成重发的新码。
 */
export async function waitForCode(
  api: NexApiRequester,
  tel: string,
  waitSeconds = 0,
  onlyNew = false
): Promise<CodeWaitResult> {
  const deadline = Date.now() + waitSeconds * 1000;
  let seen: Set<string> | undefined;
  let contextId: string | undefined;
  for (;;) {
    const response = await pull(api, tel, contextId);
    if (response.code !== 0) return { ok: false, response };
    if (contextId && response.contextId !== contextId)
      return {
        ok: false,
        response: {
          code: 'SESSION_CONTEXT_CHANGED',
          msg: 'Session or team changed while waiting for SMS; discard the result and return to the original context.'
        }
      };
    contextId ??= response.contextId;
    const view = recordView(response.data);
    const codes = view.messages.map((message) => message.code).filter(Boolean) as string[];
    seen ??= onlyNew ? new Set(codes) : new Set();
    const fresh = view.messages.find((message) => message.code && !seen!.has(message.code));
    const current = { ...view, code: fresh?.code };
    // Only state 0 is still waiting; 1 may receive more SMS, anything else is final.
    // 仅 state 0/1 仍可能收到短信，其余为终态。
    const final = view.state !== undefined && view.state !== 0 && view.state !== 1;
    if (current.code || final || Date.now() + SMS_POLL_INTERVAL_MS > deadline) {
      return { ok: true, view: current };
    }
    await sleep(SMS_POLL_INTERVAL_MS);
  }
}
