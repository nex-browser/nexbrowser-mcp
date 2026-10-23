import { z } from 'zod';
import { BROWSER_CAPTCHA_TOOL_SPECS } from './browser-captcha-tools.js';
import { bindTools, defineTool, type McpToolSpec } from '../../shared/define-tool.js';
import { apiErrorResult, errorResult, successResult } from '../../shared/tool-result.js';
import { PAID_TOOL_NOTE, resourceRecovery } from '../../shared/service-recovery.js';
import {
  assertCaptchaReady,
  captchaAdapterInput,
  captchaProductCode,
  readCaptchaContract,
  requireCaptchaContract,
  validateOnlineCaptchaAdapter
} from './online-schema.js';
import {
  parseServiceJson,
  serviceId,
  servicePage,
  servicePager,
  serviceTool
} from '../../shared/service-tools.js';
import type { NexApiClient } from '../../transport/nex-api-client.js';
import {
  CAPTCHA_PRODUCTS_ROUTE,
  CAPTCHA_SCHEMA_ROUTE,
  CAPTCHA_BUY_ROUTE,
  CAPTCHA_RECORDS_ROUTE,
  CAPTCHA_QUERY_ROUTE
} from '../../transport/routes.js';

const terminalStates = new Set(['SUCCEEDED', 'FAILED', 'EXPIRED']);
const taskFields = new Set([
  'id',
  'productCode',
  'state',
  'price',
  'userId',
  'teamId',
  'uuid',
  'taskId',
  'createdAt',
  'updatedAt',
  'createTime',
  'updateTime',
  'expireTime',
  'expiresAt',
  'expiredAt'
]);

/** 列表保留任务归属与实际预扣价，任务答案只在单任务查询时展开。 */
function taskSummary(row: any) {
  const record = Object.fromEntries(
    Object.entries(row ?? {}).filter(([key]) => taskFields.has(key))
  );
  const failure = parseServiceJson(row?.failure, null);
  return {
    ...record,
    ...(failure && typeof failure === 'object'
      ? { failure: { code: failure.code, nextAction: failure.nextAction } }
      : {}),
    terminal: terminalStates.has(row?.state)
  };
}

export const CAPTCHA_TOOL_SPECS: readonly McpToolSpec[] = [
  serviceTool({
    name: 'nex_captcha_product_list',
    description:
      'List enabled CAPTCHA products. price is the final per-task price; do not recalculate it. Use productCode exactly as returned, and read nex_captcha_product_schema(productCode) before creating a task.',
    schema: z.object({}).strict(),
    route: CAPTCHA_PRODUCTS_ROUTE,
    readOnly: true,
    project: (data) => ({
      text: 'Current CAPTCHA products and payable USDT prices.',
      data: {
        rows: (Array.isArray(data) ? data : []).map((product: any) => ({
          ...product,
          parameterSchemaTool: 'nex_captcha_product_schema'
        }))
      }
    })
  }),
  serviceTool({
    name: 'nex_captcha_product_schema',
    description:
      'Free, read-only: read the online adapter schema, example, integration/result contract and workflowGuide for one productCode from nex_captcha_product_list (exact match; no aliases or offline fallback). Keep every schema constraint; examples are placeholders. Check integration.workflows: HTTP_SUBMIT needs a separate site HTTP integration, browser workflows need a supported local adapter, and page CAPTCHAs start with nex_browser_captcha_prepare. DOCUMENTATION_REQUIRED blocks paid tasks.',
    schema: z.object({ productCode: captchaProductCode }).strict(),
    route: CAPTCHA_SCHEMA_ROUTE,
    method: 'POST',
    readOnly: true,
    project: (data, args) => ({
      text: 'Current online NexCaptcha product contract. No offline fallback; use actual challenge inputs before purchasing.',
      data: requireCaptchaContract(data, args.productCode)
    })
  }),
  defineTool({
    name: 'nex_captcha_buy',
    description: `Create a standalone CAPTCHA recognition task from actual challenge inputs that match nex_captcha_product_schema (adapter object, no platform API keys). It only returns a solution and never submits to the website. Page CAPTCHAs must use nex_browser_captcha_prepare/submit/complete; never use this tool to bypass an unsupported page adapter or to substitute GRID. The schema is rechecked before charging. Keep the local id, not the upstream taskId. ${PAID_TOOL_NOTE}`,
    inputSchema: z
      .object({
        productCode: captchaProductCode,
        adapter: captchaAdapterInput
      })
      .strict(),
    annotations: { destructiveHint: true, idempotentHint: false },
    execute: async (args, ctx) => {
      let contextId: string;
      try {
        const online = await readCaptchaContract(ctx, args.productCode);
        assertCaptchaReady(online.contract);
        validateOnlineCaptchaAdapter(online.contract, args.adapter);
        contextId = online.contextId;
      } catch (error) {
        return errorResult(
          `No purchase attempted. ${error instanceof Error ? error.message : 'Online CAPTCHA schema unavailable.'}`,
          {
            code: 'CAPTCHA_PREFLIGHT_FAILED',
            purchaseAttempted: false,
            recovery: resourceRecovery('captcha', 'RETRY_CHALLENGE', 'PREPARATION_REQUIRED')
          }
        );
      }
      try {
        const response = await ctx.api.request(CAPTCHA_BUY_ROUTE, {
          method: 'POST',
          headers: { 'X-Nex-Service-Context': contextId },
          body: JSON.stringify(args)
        });
        if (response.code !== 0) {
          const result = apiErrorResult(
            'CAPTCHA purchase failed; reconcile records and billing before any new purchase',
            response
          );
          if (result.structuredContent?.billingBlocked === true) return result;
          return errorResult(String((result.content[0] as { text: string }).text), {
            ...result.structuredContent,
            recovery: resourceRecovery('captcha', 'RECONCILE', 'PURCHASE_OUTCOME_UNKNOWN')
          });
        }
        return successResult(
          'Task creation accepted; query the local id with nex_captcha_query. Creation does not mean solving succeeded.',
          {
            record: response.data ? taskSummary(response.data) : null,
            ...(!Number.isSafeInteger((response.data as any)?.id) ||
            (response.data as any).id <= 0 ||
            (response.data as any).productCode !== args.productCode
              ? {
                  code: 'OUTCOME_UNKNOWN',
                  recovery: resourceRecovery('captcha', 'RECONCILE', 'ALLOCATION_UNKNOWN')
                }
              : {})
          }
        );
      } catch {
        return errorResult(
          'Purchase outcome is unknown. Reconcile nex_captcha_record_list and nex_billing_trade_list; do not automatically repeat this purchase.',
          {
            code: 'OUTCOME_UNKNOWN',
            recovery: resourceRecovery('captcha', 'RECONCILE', 'PURCHASE_OUTCOME_UNKNOWN')
          }
        );
      }
    }
  }),
  serviceTool({
    name: 'nex_captcha_record_list',
    description:
      'List CAPTCHA tasks of the current user and team; keyword matches productCode. price stays the original charge after refunds; check billing for refunds.',
    schema: servicePager,
    route: CAPTCHA_RECORDS_ROUTE,
    readOnly: true,
    project: (data) => ({
      text: 'CAPTCHA task records; query a local id for its solution.',
      data: servicePage(data, taskSummary)
    })
  }),
  serviceTool({
    name: 'nex_captcha_query',
    description:
      'Query one local CAPTCHA record id (not the upstream taskId) every 3–5 seconds while needed; at most 5 calls per 3 seconds. Stop on SUCCEEDED, FAILED or EXPIRED. solution may be text, a token or product-specific fields. FAILED/EXPIRED are refunded by the server; verify billing. Network errors and unknown states are not failures. No cancel or manual refund.',
    schema: z.object({ id: serviceId }).strict(),
    route: CAPTCHA_QUERY_ROUTE,
    method: 'POST',
    project: (data) => ({
      text: data
        ? `Task state: ${data.state}. ${terminalStates.has(data.state) ? 'Stop polling.' : 'Query again after 3–5 seconds if needed.'}${['FAILED', 'EXPIRED'].includes(data.state) ? ' Refresh nex_billing_trade_list to verify the refund.' : ''}`
        : 'No task data returned; verify the local id and current team.',
      data: {
        record: data
          ? { ...taskSummary(data), solution: parseServiceJson(data.solution, {}) }
          : null,
        ...(['FAILED', 'EXPIRED'].includes(data?.state)
          ? {
              recovery: resourceRecovery(
                'captcha',
                'RETRY_CHALLENGE',
                'CONFIRMED_SOLVER_FAILURE',
                data.id
              )
            }
          : {})
      }
    })
  }),
  ...BROWSER_CAPTCHA_TOOL_SPECS
];

/** 将识别工具绑定到当前 MCP 客户端。 */
export function createCaptchaTools(client: NexApiClient) {
  return bindTools(CAPTCHA_TOOL_SPECS, { api: client, sessions: client });
}
