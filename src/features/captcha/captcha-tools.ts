import { z } from 'zod';
import { BROWSER_CAPTCHA_TOOL_SPECS } from './browser-captcha-tools.js';
import { bindTools, defineTool, type McpToolSpec } from '../../shared/define-tool.js';
import { apiErrorResult, errorResult, successResult } from '../../shared/tool-result.js';
import {
  assertCaptchaReady,
  captchaAdapterInput,
  captchaProductCode,
  readCaptchaContract,
  requireCaptchaContract,
  validateOnlineCaptchaAdapter
} from './online-schema.js';
import {
  maxTotalPrice,
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
      'List enabled CAPTCHA solving products. Returned price is the single payable price, already rounded by the backend. Do not multiply or round it again. productCode must come from this list. Before creating a task, call nex_captcha_product_schema(productCode) for required adapter fields, input modes and result usage; documentation alone does not confirm availability.',
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
      'Read the current online NexCaptcha adapter schema, example, integration/result contract and workflowGuide through the signed-in Desktop client. Free, read-only and requires a connection. productCode is required and must exactly match nex_captcha_product_list; no aliases or offline fallback. Preserve all schema constraints and unknown fields. Examples are placeholders, not real challenge inputs. DOCUMENTATION_REQUIRED blocks paid tasks. Online product support does not imply browser capture/apply support.',
    schema: z.object({ productCode: captchaProductCode }).strict(),
    route: CAPTCHA_SCHEMA_ROUTE,
    method: 'POST',
    readOnly: true,
    project: (data, args) => ({
      text: 'Current online NexCaptcha product contract. No offline fallback; use actual challenge inputs and obtain fee approval before purchasing.',
      data: requireCaptchaContract(data, args.productCode)
    })
  }),
  defineTool({
    name: 'nex_captcha_buy',
    description:
      'Create a CAPTCHA solving task and precharge once after explicit fee/scope approval (the host approval panel may supply it). Read nex_captcha_product_schema and use actual challenge inputs. Rechecks the online schema before buying; schema errors, unavailable contracts and DOCUMENTATION_REQUIRED stop before payment. Product rules come exclusively from the server, with no bundled catalog or aliases. Preflight maxTotalPrice is not atomic. adapter must be an object without platform API keys. Retain local id, never upstream taskId. Never automatically retry or substitute GRID.',
    inputSchema: z
      .object({
        productCode: captchaProductCode,
        adapter: captchaAdapterInput,
        maxTotalPrice
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
          `No purchase attempted. ${error instanceof Error ? error.message : 'Online CAPTCHA schema unavailable.'}`
        );
      }
      try {
        const response = await ctx.api.request(CAPTCHA_BUY_ROUTE, {
          method: 'POST',
          headers: { 'X-Nex-Service-Context': contextId },
          body: JSON.stringify(args)
        });
        if (response.code !== 0)
          return apiErrorResult(
            'CAPTCHA purchase failed; reconcile records and billing before any new purchase',
            response
          );
        return successResult(
          'Task creation accepted; query the local id with nex_captcha_query. Creation does not mean solving succeeded.',
          { record: response.data ? taskSummary(response.data) : null }
        );
      } catch {
        return errorResult(
          'Purchase outcome is unknown. Reconcile nex_captcha_record_list and nex_billing_trade_list; do not automatically repeat this purchase.'
        );
      }
    }
  }),
  serviceTool({
    name: 'nex_captcha_record_list',
    description:
      'List current user/current team CAPTCHA tasks. keyword matches productCode. price remains the original precharge even after refunds; inspect billing for refund entries.',
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
      'Query one local CAPTCHA record id, never upstream taskId. Poll every 3–5 seconds only while needed; at most 5 calls per user per 3 seconds. Stop on SUCCEEDED, FAILED or EXPIRED. solution may contain text, token or product-specific fields. FAILED/EXPIRED trigger server refunds; verify billing. Network errors or unknown states are not failure/refund evidence. No cancel or manual refund API.',
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
          : null
      }
    })
  }),
  ...BROWSER_CAPTCHA_TOOL_SPECS
];

/** 将识别工具绑定到当前 MCP 客户端。 */
export function createCaptchaTools(client: NexApiClient) {
  return bindTools(CAPTCHA_TOOL_SPECS, { api: client, sessions: client });
}
