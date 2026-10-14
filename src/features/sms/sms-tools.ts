import { z } from 'zod';
import { bindTools, defineTool, type McpToolSpec } from '../../shared/define-tool.js';
import { apiErrorResult, errorResult, successResult } from '../../shared/tool-result.js';
import type { McpToolDefinition, NexApiRequester, NexApiResponse } from '../../shared/types.js';
import { NexApiClient } from '../../transport/nex-api-client.js';
import {
  SMS_BUY_ROUTE,
  SMS_COUNTRIES_ROUTE,
  SMS_PULL_ROUTE,
  SMS_RECORDS_ROUTE,
  SMS_RECOVER_ROUTE,
  SMS_STOCKS_ROUTE
} from '../../transport/routes.js';
import { callAction } from '../browser-automation/common.js';
import { automationSchema, TARGET_PROPERTY } from '../browser-automation/schema.js';

/** Same cap as the client OpenAPI route; bigger orders belong in the Desktop UI. 与客户端 OpenAPI 路由一致的单次购买上限。 */
export const SMS_MAX_BUY_QUANTITY = 10;
/** Upper bound for nex_sms_code_get / nex_sms_code_fill polling. 接码轮询的最长等待秒数。 */
export const SMS_MAX_WAIT_SECONDS = 120;
const SMS_POLL_INTERVAL_MS = 5_000;

const STATE_LABELS: Record<string, string> = {
  '0': 'waiting for SMS',
  '1': 'SMS received',
  '2': 'expired',
  '-1': 'refunded'
};

const RECOVER_REASONS = [
  'no_code',
  'rejected',
  'already_registered',
  'cannot_send_code',
  'other'
] as const;

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
export function parseSmsMessages(raw: unknown): SmsMessage[] {
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
function recordView(record: any) {
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

function recordLine(view: ReturnType<typeof recordView>): string {
  return [
    `- ${view.tel} | ${view.projectName ?? '-'} / ${view.countryName ?? '-'}`,
    `  State: ${view.stateLabel ?? view.state ?? '-'}${view.code ? ` | Code: ${view.code}` : ''}`,
    `  Expires: ${view.expireTime ?? '-'} | Order: ${view.orderNo ?? '-'}`
  ].join('\n');
}

function payableUnitPrice(project: any): number | undefined {
  for (const value of [project?.discountPrice, project?.price]) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

async function pull(api: NexApiRequester, tel: string) {
  return api.request<any>(SMS_PULL_ROUTE, { method: 'POST', body: JSON.stringify({ tel }) });
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
async function waitForCode(
  api: NexApiRequester,
  tel: string,
  waitSeconds = 0,
  onlyNew = false
): Promise<CodeWaitResult> {
  const deadline = Date.now() + waitSeconds * 1000;
  let seen: Set<string> | undefined;
  for (;;) {
    const response = await pull(api, tel);
    if (response.code !== 0) return { ok: false, response };
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

export const SMS_TOOL_SPECS: readonly McpToolSpec[] = [
  defineTool({
    name: 'nex_sms_country_list',
    description:
      'List the countries/regions where NexBrowser cloud phone numbers (SMS verification numbers) can be bought. Use the countryId with nex_sms_project_list.',
    annotations: { readOnlyHint: true },
    inputSchema: z.object({}).passthrough(),
    execute: async (_args, ctx) => {
      const response = await ctx.api.request<any>(SMS_COUNTRIES_ROUTE, { method: 'GET' });
      if (response.code !== 0) return apiErrorResult('Failed to list SMS countries', response);
      const rows = Array.isArray(response.data) ? response.data : [];
      return successResult(
        rows.length
          ? [
              `Found ${rows.length} country/region(s):`,
              ...rows.map((row: any) => `- countryId ${row.countryId}: ${row.countryName}`)
            ].join('\n')
          : 'No countries available.',
        { rows }
      );
    }
  }),
  defineTool({
    name: 'nex_sms_project_list',
    description:
      'List the projects (target apps/sites such as Telegram or WhatsApp) of one country with live unit price and stock. Call this before nex_sms_buy to pick a projectId and to quote the price to the user.',
    annotations: { readOnlyHint: true },
    inputSchema: z.object({ countryId: z.number().int().positive() }).strict(),
    execute: async (args, ctx) => {
      const query = new URLSearchParams({ countryId: String(args.countryId) });
      const response = await ctx.api.request<any>(`${SMS_STOCKS_ROUTE}?${query}`, {
        method: 'GET'
      });
      if (response.code !== 0) return apiErrorResult('Failed to list SMS projects', response);
      const rows = Array.isArray(response.data) ? response.data : [];
      return successResult(
        rows.length
          ? [
              `Found ${rows.length} project(s):`,
              ...rows.map(
                (row: any) =>
                  `- projectId ${row.projectId}: ${row.projectName} | Price: ${payableUnitPrice(row) ?? '-'}${row.currency ? ` ${row.currency}` : ''} | Stock: ${row.available ?? 0}`
              )
            ].join('\n')
          : 'No projects available in this country.',
        { rows }
      );
    }
  }),
  defineTool({
    name: 'nex_sms_buy',
    description: `Buy cloud phone numbers for receiving SMS verification codes. This CHARGES THE ACCOUNT BALANCE: quote the project, quantity, and total price from nex_sms_project_list to the user and get explicit confirmation before calling. maxTotalPrice is the most the user agreed to pay; the order is refused if the live total exceeds it. At most ${SMS_MAX_BUY_QUANTITY} numbers per call. Then use nex_sms_code_fill to type the code into the page.`,
    annotations: { destructiveHint: true, idempotentHint: false },
    inputSchema: z
      .object({
        countryId: z.number().int().positive(),
        projectId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(SMS_MAX_BUY_QUANTITY).default(1),
        maxTotalPrice: z.number().nonnegative()
      })
      .strict(),
    execute: async (args, ctx) => {
      const response = await ctx.api.request<any>(SMS_BUY_ROUTE, {
        method: 'POST',
        body: JSON.stringify(args)
      });
      if (response.code !== 0) return apiErrorResult('Failed to buy phone numbers', response);
      const rows = (Array.isArray(response.data) ? response.data : []).map(recordView);
      return successResult(
        [
          `Bought ${rows.length || args.quantity} phone number(s):`,
          ...rows.map(recordLine),
          '',
          'Use the number on the target site, then call nex_sms_code_fill (or nex_sms_code_get) with tel.'
        ].join('\n'),
        { rows }
      );
    }
  }),
  defineTool({
    name: 'nex_sms_record_list',
    description:
      'List purchased cloud phone numbers with state, expiry, and the latest verification code. keyword filters by number or project.',
    annotations: { readOnlyHint: true },
    inputSchema: z
      .object({
        page: z.number().int().positive().optional(),
        size: z.number().int().min(1).max(100).optional(),
        keyword: z.string().optional()
      })
      .strict(),
    execute: async (args, ctx) => {
      const query = new URLSearchParams({
        page: String(args.page ?? 1),
        size: String(args.size ?? 20)
      });
      if (args.keyword?.trim()) query.set('keyword', args.keyword.trim());
      const response = await ctx.api.request<any>(`${SMS_RECORDS_ROUTE}?${query}`, {
        method: 'GET'
      });
      if (response.code !== 0) return apiErrorResult('Failed to list phone numbers', response);
      const data = response.data ?? {};
      const list = Array.isArray(data)
        ? data
        : ([data.rows, data.records, data.list, data.items, data.data].find(Array.isArray) ?? []);
      const rows = list.map(recordView);
      const total = Number(data.total ?? data.totalCount ?? data.count ?? rows.length);
      return successResult(
        rows.length
          ? [`Found ${total} phone number(s):`, ...rows.map(recordLine)].join('\n')
          : 'No phone numbers found.',
        { total, rows }
      );
    }
  }),
  defineTool({
    name: 'nex_sms_code_get',
    description: `Fetch the latest SMS and verification code of one purchased number. Set waitSeconds (max ${SMS_MAX_WAIT_SECONDS}) to keep polling until a code arrives or the number stops waiting; onlyNew ignores codes already received. To type the code into a NexBrowser page, prefer nex_sms_code_fill.`,
    annotations: { readOnlyHint: true },
    inputSchema: z
      .object({
        tel: z.string().min(1),
        waitSeconds: z.number().int().min(0).max(SMS_MAX_WAIT_SECONDS).optional(),
        onlyNew: z.boolean().optional()
      })
      .strict(),
    execute: async (args, ctx) => {
      const tel = args.tel.trim();
      const result = await waitForCode(ctx.api, tel, args.waitSeconds, args.onlyNew);
      if (!result.ok) return apiErrorResult('Failed to fetch SMS', result.response);
      const view = result.view;
      return successResult(
        [
          view.code
            ? `Verification code for ${tel}: **${view.code}**`
            : `No verification code yet for ${tel} (${view.stateLabel ?? 'unknown state'}).`,
          ...(view.messages[0]?.sms ? [`Latest SMS: ${view.messages[0].sms}`] : []),
          ...(!view.code && (view.state === 0 || view.state === 1)
            ? ['Retry later, or release it with nex_sms_release (reason no_code) for a refund.']
            : [])
        ].join('\n'),
        { record: view }
      );
    }
  }),
  defineTool({
    name: 'nex_sms_code_fill',
    description: `Wait for the SMS verification code of one purchased number and type it straight into the NexBrowser automation session, so the code never has to pass through the conversation. Typical flow: nex_sms_buy, type the number into the site, click its send-code button, take nex_browser_snapshot to get the code input ref, then call this. Set onlyNew after asking the site to resend a code. submit=true presses Enter after filling. Polls up to waitSeconds (max ${SMS_MAX_WAIT_SECONDS}, default 90).`,
    inputSchema: automationSchema({
      tel: z.string().min(1),
      target: TARGET_PROPERTY,
      waitSeconds: z.number().int().min(0).max(SMS_MAX_WAIT_SECONDS).optional(),
      onlyNew: z.boolean().optional(),
      submit: z.boolean().optional()
    }),
    execute: async (args, ctx) => {
      const tel = args.tel.trim();
      const result = await waitForCode(ctx.api, tel, args.waitSeconds ?? 90, args.onlyNew);
      if (!result.ok) return apiErrorResult('Failed to fetch SMS', result.response);
      const { code, stateLabel, state } = result.view;
      if (!code) {
        return errorResult(
          `No verification code arrived for ${tel} (${stateLabel ?? 'unknown state'}). Nothing was filled.${
            state === 0 || state === 1
              ? ' Ask the site to resend and call again with onlyNew=true, or release the number with nex_sms_release (reason no_code).'
              : ''
          }`,
          { code: 'SMS_CODE_TIMEOUT', tel, state }
        );
      }
      const filled = await callAction(
        ctx,
        args,
        'fill',
        { target: args.target, value: code },
        'Verification code filled.'
      );
      if (filled.isError) return filled;
      if (args.submit) {
        const pressed = await callAction(
          ctx,
          args,
          'press',
          { target: args.target, key: 'Enter' },
          'Verification code filled and submitted.'
        );
        if (pressed.isError) return pressed;
        return successResult(
          `Filled the ${code.length}-character code for ${tel} and pressed Enter. Take nex_browser_snapshot to verify the result.`,
          { tel, filled: true, submitted: true }
        );
      }
      return successResult(
        `Filled the ${code.length}-character code for ${tel}. Submit the form, then take nex_browser_snapshot to verify the result.`,
        { tel, filled: true, submitted: false }
      );
    }
  }),
  defineTool({
    name: 'nex_sms_release',
    description:
      'Release one purchased number that is still active and request a refund, e.g. when no code arrived (no_code) or the site rejected the number. The number cannot be used afterwards.',
    annotations: { destructiveHint: true },
    inputSchema: z.object({ tel: z.string().min(1), reason: z.enum(RECOVER_REASONS) }).strict(),
    execute: async (args, ctx) => {
      const tel = args.tel.trim();
      const response = await ctx.api.request<any>(SMS_RECOVER_ROUTE, {
        method: 'POST',
        body: JSON.stringify({ tel, reason: args.reason })
      });
      if (response.code !== 0) return apiErrorResult('Failed to release phone number', response);
      const view = response.data ? recordView(response.data) : undefined;
      return successResult(
        `Released ${tel}${view?.stateLabel ? ` (${view.stateLabel})` : ''}.`,
        view ? { record: view } : undefined
      );
    }
  })
];

/** Binds SMS tools to a live client. 将接码工具绑定到运行中的客户端。 */
export function createSmsTools(client: NexApiClient): McpToolDefinition[] {
  return bindTools(SMS_TOOL_SPECS, { api: client, sessions: client });
}
