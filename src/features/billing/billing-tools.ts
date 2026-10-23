import { bindTools, type McpToolSpec } from '../../shared/define-tool.js';
import { servicePage, servicePager, serviceTool } from '../../shared/service-tools.js';
import type { NexApiClient } from '../../transport/nex-api-client.js';
import { BILLING_TRADES_ROUTE } from '../../transport/routes.js';

export const BILLING_TOOL_SPECS: readonly McpToolSpec[] = [
  serviceTool({
    name: 'nex_billing_trade_list',
    description:
      "List the current user's payments and refunds (positive amount = credit, negative = debit). Branch on type, not the translated remark/typeRemark. Use it to reconcile unclear purchases; it is not an idempotency guarantee.",
    schema: servicePager.omit({ keyword: true }),
    route: BILLING_TRADES_ROUTE,
    readOnly: true,
    project: (data) => ({ text: 'Payment and refund trades in USDT.', data: servicePage(data) })
  })
];

/** 将账单工具绑定到当前 MCP 客户端。 */
export function createBillingTools(client: NexApiClient) {
  return bindTools(BILLING_TOOL_SPECS, { api: client, sessions: client });
}
