import { z } from 'zod';
import { bindTools, defineTool, type McpToolSpec } from '../../shared/define-tool.js';
import { apiErrorResult, errorResult, successResult } from '../../shared/tool-result.js';
import { maxTotalPrice } from '../../shared/service-tools.js';
import type { McpToolDefinition } from '../../shared/types.js';
import { NexApiClient } from '../../transport/nex-api-client.js';
import {
  SMS_BUY_ROUTE,
  SMS_COUNTRIES_ROUTE,
  SMS_RECORDS_ROUTE,
  SMS_RECOVER_ROUTE,
  SMS_STOCKS_ROUTE
} from '../../transport/routes.js';
import { callAction } from '../browser-automation/common.js';
import { automationSchema, TARGET_PROPERTY } from '../browser-automation/schema.js';
import {
  payableUnitPrice,
  recordLine,
  recordSummary,
  recordView,
  waitForCode
} from './sms-records.js';

/** Same cap as the client OpenAPI route; bigger orders belong in the Desktop UI. 与客户端 OpenAPI 路由一致的单次购买上限。 */
export const SMS_MAX_BUY_QUANTITY = 10;
/** Upper bound for nex_sms_code_get / nex_sms_code_fill polling. 接码轮询的最长等待秒数。 */
export const SMS_MAX_WAIT_SECONDS = 120;

const RECOVER_REASONS = [
  'no_code',
  'rejected',
  'already_registered',
  'cannot_send_code',
  'other'
] as const;

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
    description: `Buy cloud phone numbers for receiving SMS verification codes. This CHARGES THE ACCOUNT BALANCE: quote the project, quantity, and total price from nex_sms_project_list and get explicit user confirmation first. maxTotalPrice is a live preflight ceiling, not an atomic backend guarantee. At most ${SMS_MAX_BUY_QUANTITY} numbers per call. A null result requires record reconciliation; batch failures may have partially purchased numbers. Never automatically retry.`,
    annotations: { destructiveHint: true, idempotentHint: false },
    inputSchema: z
      .object({
        countryId: z.number().int().positive(),
        projectId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(SMS_MAX_BUY_QUANTITY).default(1),
        maxTotalPrice
      })
      .strict(),
    execute: async (args, ctx) => {
      let response;
      try {
        response = await ctx.api.request<any>(SMS_BUY_ROUTE, {
          method: 'POST',
          body: JSON.stringify(args)
        });
      } catch {
        return errorResult(
          'Purchase outcome is unknown. Refresh nex_sms_record_list and nex_billing_trade_list; do not automatically repeat the purchase.'
        );
      }
      if (response.code !== 0)
        return apiErrorResult(
          'Purchase may be partial; refresh records and billing before any further purchase',
          response
        );
      const rows = (Array.isArray(response.data) ? response.data : []).map(recordView);
      if (!rows.length) {
        // 空成功响应没有本次号码标识；刷新候选记录但不冒认历史号码属于本次订单。
        const refreshed = await ctx.api
          .request<any>(`${SMS_RECORDS_ROUTE}?page=1&size=100`, {
            method: 'GET',
            ...(response.contextId
              ? { headers: { 'X-Nex-Service-Context': response.contextId } }
              : {})
          })
          .catch(() => undefined);
        const recordsRefreshed =
          refreshed?.code === 0 &&
          (!response.contextId || response.contextId === refreshed.contextId);
        const data = recordsRefreshed ? refreshed?.data : undefined;
        const records = Array.isArray(data) ? data : (data?.data ?? data?.rows ?? []);
        const candidates = (Array.isArray(records) ? records : [])
          .filter(
            (row: any) =>
              Number(row.countryId) === args.countryId && Number(row.projectId) === args.projectId
          )
          .map(recordSummary);
        return successResult(
          'Purchase request succeeded without number IDs. Recent matching records were refreshed but may include older purchases. Reconcile records and nex_billing_trade_list before selecting a number or purchasing again.',
          {
            requestedQuantity: args.quantity,
            deliveryConfirmed: false,
            recordsRefreshed,
            candidateRecords: candidates
          }
        );
      }
      return successResult(
        [
          `Server returned ${rows.length} purchased phone number(s):`,
          ...rows.map(recordLine),
          '',
          'Use the number on the target site, then call nex_sms_code_fill (or nex_sms_code_get) with tel.'
        ].join('\n'),
        { rows, requestedQuantity: args.quantity, deliveryConfirmed: rows.length === args.quantity }
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
      const rows = list.map(recordSummary);
      const total = Number(data.count ?? data.totalCount ?? data.total ?? rows.length);
      return successResult(
        rows.length
          ? [`Found ${total} phone number(s):`, ...rows.map(recordLine)].join('\n')
          : 'No phone numbers found.',
        { total, totalPages: data.count === undefined ? undefined : data.total, rows }
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
      'Request release and refund of one waiting number. Obtain explicit approval of the number first. A null response or old state does not prove a new refund; refresh the number and billing. Refund eligibility and amount are decided by the server/upstream. Never automatically retry.',
    annotations: { destructiveHint: true, idempotentHint: false },
    inputSchema: z.object({ tel: z.string().min(1), reason: z.enum(RECOVER_REASONS) }).strict(),
    execute: async (args, ctx) => {
      const tel = args.tel.trim();
      let response;
      try {
        response = await ctx.api.request<any>(SMS_RECOVER_ROUTE, {
          method: 'POST',
          body: JSON.stringify({ tel, reason: args.reason })
        });
      } catch {
        return errorResult(
          'Release outcome is unknown. Refresh nex_sms_record_list and nex_billing_trade_list; do not automatically retry.'
        );
      }
      if (response.code !== 0) return apiErrorResult('Failed to release phone number', response);
      const view = response.data ? recordView(response.data) : undefined;
      return successResult(
        `Release request accepted for ${tel}${view?.stateLabel ? ` (returned state: ${view.stateLabel})` : ''}. Refresh nex_sms_record_list and nex_billing_trade_list to confirm the final state and any refund; this response does not establish a new refund.`,
        { record: view ?? null, refundConfirmed: false }
      );
    }
  })
];

/** Binds SMS tools to a live client. 将接码工具绑定到运行中的客户端。 */
export function createSmsTools(client: NexApiClient): McpToolDefinition[] {
  return bindTools(SMS_TOOL_SPECS, { api: client, sessions: client });
}
