import { z } from 'zod';
import { BROWSER_CAPTCHA_TOOL_SPECS } from './browser-captcha-tools.js';
import { bindTools, defineTool, type McpToolSpec } from '../../shared/define-tool.js';
import { errorResult, successResult } from '../../shared/tool-result.js';
import {
  CAPTCHA_SCHEMA_SOURCE,
  captchaAdapterInput,
  captchaProductConditions,
  captchaProductDefinition,
  captchaProductSummaries,
  validateCaptchaAdapter
} from './product-schemas.js';
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
const schemaNote =
  'Offline documentation snapshot, not current product availability or pricing. Use nex_captcha_product_list for enabled products and payable USDT prices. Desktop purchases use the existing login and local record id; no NexCaptcha API key or upstream taskId is needed. DOCUMENTATION_REQUIRED products need an established result contract before any paid task; do not guess results or use GRID as a generic fallback.';

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
          parameterSchemaAvailable: Boolean(captchaProductDefinition(product.productCode)),
          parameterSchemaTool: 'nex_captcha_product_schema'
        }))
      }
    })
  }),
  defineTool({
    name: 'nex_captcha_product_schema',
    description:
      'Read the documented NexCaptcha product adapter and result contracts without network access or charges. Omit productCode to list all 50 documented products; pass a code for required/optional fields, types, mutually exclusive modes, result schema/examples, input sources and application requirements. Consult before nex_captcha_buy. These are standalone parameter contracts, not a promise that the browser can collect/apply every product. Use nex_captcha_product_list for live availability/prices. TURNSTILE is a legacy lookup alias for CLOUDFLARE_TURNSTILE; purchases retain the live catalog code.',
    inputSchema: z.object({ productCode: z.string().min(1).optional() }).strict(),
    annotations: { readOnlyHint: true, idempotentHint: true },
    execute: async ({ productCode }) => {
      if (!productCode)
        return successResult(
          'Documented NexCaptcha parameter catalog; select a productCode for full details.',
          {
            source: CAPTCHA_SCHEMA_SOURCE,
            rows: captchaProductSummaries(),
            note: schemaNote
          }
        );
      const definition = captchaProductDefinition(productCode);
      if (!definition)
        return errorResult(
          'No bundled parameter contract for this productCode. Consult the current official documentation and enabled product list; do not guess adapter fields.',
          { productCode, source: CAPTCHA_SCHEMA_SOURCE }
        );
      return successResult(
        `NexCaptcha ${definition.productCode} input and result contract. ${schemaNote}`,
        {
          source: CAPTCHA_SCHEMA_SOURCE,
          requestedProductCode: productCode,
          ...definition,
          note: schemaNote
        }
      );
    }
  }),
  serviceTool({
    name: 'nex_captcha_buy',
    description:
      'Create a CAPTCHA solving task and precharge the balance once. Read nex_captcha_product_schema for the selected live product, collect actual challenge inputs and quote the product, price and intended result use. Obtain explicit user approval (the host approval panel may supply it) before execution. Known products reject missing, unsupported or mistyped adapter fields; unknown future products still require a verified contract. Preflight maxTotalPrice is not atomic. adapter must be an object, never null. Creation is asynchronous; retain local id, not upstream taskId. Never automatically retry or substitute GRID after a failure.',
    schema: z
      .object({
        productCode: z.string().min(1),
        adapter: captchaAdapterInput,
        maxTotalPrice
      })
      .strict()
      .superRefine(({ productCode, adapter }, context) =>
        validateCaptchaAdapter(productCode, adapter, context)
      )
      .meta({ allOf: captchaProductConditions() }),
    route: CAPTCHA_BUY_ROUTE,
    method: 'POST',
    consequential: true,
    reconcile:
      'Refresh nex_captcha_record_list and nex_billing_trade_list to reconcile the task and charge.',
    project: (data) => ({
      text: 'Task creation accepted; query the local id with nex_captcha_query. Creation does not mean solving succeeded.',
      data: { record: data ? taskSummary(data) : null }
    })
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
