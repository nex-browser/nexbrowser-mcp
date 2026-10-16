import { z } from 'zod';
import { BROWSER_CAPTCHA_TOOL_SPECS } from './browser-captcha-tools.js';
import { bindTools, type McpToolSpec } from '../../shared/define-tool.js';
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

/** 列表保留任务归属与实际预扣价，任务答案只在单任务查询时展开。 */
function taskSummary(row: any) {
  const { product: _product, solution: _solution, ...record } = row ?? {};
  return { ...record, terminal: terminalStates.has(row?.state) };
}

export const CAPTCHA_TOOL_SPECS: readonly McpToolSpec[] = [
  serviceTool({
    name: 'nex_captcha_product_list',
    description:
      'List enabled CAPTCHA solving products. Returned price is the single payable price, already rounded by the backend. Do not multiply or round it again. productCode must come from this list; adapter fields follow that product definition.',
    schema: z.object({}).strict(),
    route: CAPTCHA_PRODUCTS_ROUTE,
    readOnly: true,
    project: (data) => ({
      text: 'Current CAPTCHA products and payable USDT prices.',
      data: { rows: data ?? [] }
    })
  }),
  serviceTool({
    name: 'nex_captcha_buy',
    description:
      'Create a CAPTCHA solving task and precharge the balance once. Quote product and price and obtain explicit user confirmation first. Preflight maxTotalPrice is not atomic. adapter must be an object (possibly empty), never null. Creation is asynchronous; retain local id, not upstream taskId. Never automatically retry.',
    schema: z
      .object({
        productCode: z.string().min(1),
        adapter: z.record(z.string(), z.unknown()),
        maxTotalPrice
      })
      .strict(),
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
