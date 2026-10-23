import { z } from 'zod';
import { bindTools, type McpToolSpec } from '../../shared/define-tool.js';
import { PAID_TOOL_NOTE, resourceRecovery } from '../../shared/service-recovery.js';
import {
  parseServiceJson,
  serviceId,
  servicePage,
  servicePager,
  serviceTool
} from '../../shared/service-tools.js';
import type { NexApiClient } from '../../transport/nex-api-client.js';
import {
  IP_PRODUCTS_ROUTE,
  IP_BUY_ROUTE,
  IP_ORDERS_ROUTE,
  IP_RENEW_ROUTE,
  IP_SNAP_PLANS_ROUTE,
  IP_SNAP_PRODUCTS_ROUTE,
  IP_SNAP_BUY_ROUTE,
  IP_SNAP_PULL_ROUTE
} from '../../transport/routes.js';

const renewal = z
  .object({
    items: z
      .array(serviceId)
      .min(1)
      .max(1000)
      .refine((ids) => new Set(ids).size === ids.length, 'Duplicate proxy IDs'),
    duration: serviceId
  })
  .strict();
const reconcile =
  'Refresh nex_ip_order_list, nex_proxy_list and nex_billing_trade_list to reconcile delivery and charges.';

/** 订单只返回交付摘要；代理密码通过现有资源绑定流程使用。 */
function orderView(row: any) {
  const resources = parseServiceJson(row?.resources, []);
  const { product: _product, resources: _resources, ...record } = row ?? {};
  return {
    ...record,
    remaining:
      row?.productType === 'SNAP'
        ? Math.max(0, Number(row.quantity) - Number(row.quantitySuccess ?? 0))
        : undefined,
    resources: Array.isArray(resources)
      ? resources.map((resource: any) => ({
          type: resource.type,
          status: resource.status,
          proxyId: resource.proxyId,
          countryCode: resource.countryCode,
          locationCode: resource.locationCode,
          expireAt: resource.proxy?.expireAt ?? resource.expireAt
        }))
      : []
  };
}

/** 下单成功只表示已受理，实际交付与结算继续查订单。 */
function submitted(data: any) {
  const orders = (Array.isArray(data) ? data : data ? [data] : []).map(orderView);
  const allocationKnown =
    orders.length > 0 && orders.every((row) => row.id !== undefined && row.id !== null);
  return {
    text: `Order accepted. ${reconcile} Do not purchase again while delivery is pending.`,
    data: {
      orders,
      ...(!allocationKnown
        ? {
            code: 'OUTCOME_UNKNOWN',
            recovery: resourceRecovery('proxy', 'RECONCILE', 'ALLOCATION_UNKNOWN')
          }
        : {})
    }
  };
}

export const IP_TOOL_SPECS: readonly McpToolSpec[] = [
  serviceTool({
    name: 'nex_ip_product_list',
    description:
      'List general proxy products with live prices. The server charges by quantity, duration and product days, rounding each order total up to 2 decimals.',
    schema: z.object({}).strict(),
    route: IP_PRODUCTS_ROUTE,
    readOnly: true,
    project: (data) => ({
      text: 'Current proxy products; use the returned productId.',
      data: { rows: data ?? [] }
    })
  }),
  serviceTool({
    name: 'nex_ip_buy',
    description: `Buy general proxies. Delivery is asynchronous: check nex_ip_order_list and nex_proxy_list, and never repeat a pending order. ${PAID_TOOL_NOTE}`,
    schema: z
      .object({
        productId: z.string().min(1),
        quantity: serviceId,
        duration: serviceId.describe('Positive duration in days')
      })
      .strict(),
    route: IP_BUY_ROUTE,
    method: 'POST',
    consequential: true,
    reconcile,
    project: submitted
  }),
  serviceTool({
    name: 'nex_ip_order_list',
    description:
      'List proxy orders and short-term quotas. GENERAL PROCESSING means delivery pending; SNAP PROCESSING means quota remains available. Inspect quantitySuccess and amountRefund for partial delivery.',
    schema: servicePager.omit({ keyword: true }),
    route: IP_ORDERS_ROUTE,
    readOnly: true,
    project: (data) => ({
      text: 'Proxy orders and quota balances. Use nex_proxy_list to select delivered local proxy IDs.',
      data: servicePage(data, orderView)
    })
  }),
  serviceTool({
    name: 'nex_ip_renew',
    description: `Renew local proxy IDs from nex_proxy_list (not order or upstream IDs). Order groups may partially succeed; replace unusable proxies instead of renewing them again. ${PAID_TOOL_NOTE}`,
    schema: renewal,
    route: IP_RENEW_ROUTE,
    method: 'POST',
    consequential: true,
    reconcile,
    project: submitted
  }),
  serviceTool({
    name: 'nex_ip_snap_package_list',
    description:
      'List current short-term proxy quota packages from NEX_SNAP_IP_COMBO. Buy only an exact returned ipNum; prices are package totals in USDT.',
    schema: z.object({}).strict(),
    route: IP_SNAP_PLANS_ROUTE,
    readOnly: true,
    project: (data) => ({ text: 'Current short-term quota packages.', data: { rows: data ?? [] } })
  }),
  serviceTool({
    name: 'nex_ip_snap_country_list',
    description:
      'List supported short-term proxy countries. Codes are used unchanged when extracting; availability is not guaranteed.',
    schema: z.object({}).strict(),
    route: IP_SNAP_PRODUCTS_ROUTE,
    readOnly: true,
    project: (data) => ({ text: 'Supported extraction countries.', data: { rows: data ?? [] } })
  }),
  serviceTool({
    name: 'nex_ip_snap_buy',
    description: `Buy a short-term proxy quota package by an exact ipNum from nex_ip_snap_package_list, and keep the returned local order id for nex_ip_snap_pull. Use remaining quota first. ${PAID_TOOL_NOTE}`,
    schema: z.object({ num: serviceId }).strict(),
    route: IP_SNAP_BUY_ROUTE,
    method: 'POST',
    consequential: true,
    reconcile,
    project: submitted
  }),
  serviceTool({
    name: 'nex_ip_snap_pull',
    description:
      "Consume short-term quota to extract proxies for the user's task, without a separate payment confirmation; nexIpId is the local SNAP order ID. Extracted proxies are saved by the server. Not a read: never repeat an unclear extraction, and check remaining quota and nex_proxy_list first.",
    schema: z
      .object({ nexIpId: serviceId, countryCode: z.string().regex(/^[A-Z]{2}$/), num: serviceId })
      .strict(),
    route: IP_SNAP_PULL_ROUTE,
    method: 'POST',
    consequential: true,
    reconcile,
    project: (data) => ({
      text: 'Extraction accepted. Refresh orders for remaining quota and nex_proxy_list to select proxy IDs.',
      data: {
        extractedCount: Array.isArray(data) ? data.length : 0,
        ...(!Array.isArray(data) || !data.length
          ? {
              code: 'OUTCOME_UNKNOWN',
              recovery: resourceRecovery('proxy', 'RECONCILE', 'EXTRACTION_OUTCOME_UNKNOWN')
            }
          : {})
      }
    })
  })
];

/** 将代理市场工具绑定到当前 MCP 客户端。 */
export function createIpTools(client: NexApiClient) {
  return bindTools(IP_TOOL_SPECS, { api: client, sessions: client });
}
