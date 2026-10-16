import { z } from 'zod';
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
  IP_PRODUCTS_ROUTE,
  IP_BUY_ROUTE,
  IP_ORDERS_ROUTE,
  IP_RENEW_CALC_ROUTE,
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
  return {
    text: `Order accepted. ${reconcile} Do not purchase again while delivery is pending.`,
    data: { orders: (Array.isArray(data) ? data : data ? [data] : []).map(orderView) }
  };
}

export const IP_TOOL_SPECS: readonly McpToolSpec[] = [
  serviceTool({
    name: 'nex_ip_product_list',
    description:
      'List current general proxy products. Quote discountPrice by quantity, duration and product days; server rounds each order total UP to 2 decimal places.',
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
    description:
      'Buy general proxies and charge the balance. Quote the total and obtain explicit user confirmation first. maxTotalPrice is a live preflight ceiling, not an atomic backend guarantee. Delivery is asynchronous; never automatically retry.',
    schema: z
      .object({
        productId: z.string().min(1),
        quantity: serviceId,
        duration: serviceId.describe('Positive duration in days'),
        maxTotalPrice
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
    name: 'nex_ip_renew_quote',
    description:
      'Quote renewal for local ProxyInfo IDs from nex_proxy_list, never order IDs or upstream proxy IDs. Returns missingIds and totalPrice rounded by original order group. Review the actual renewable scope before confirmation.',
    schema: renewal,
    route: IP_RENEW_CALC_ROUTE,
    method: 'POST',
    readOnly: true,
    project: (data) => ({
      text: 'Renewal quote; review missingIds before confirming.',
      data: data ?? { rows: [], missingIds: [], totalPrice: '0' }
    })
  }),
  serviceTool({
    name: 'nex_ip_renew',
    description:
      'Renew local proxy IDs after nex_ip_renew_quote and explicit user approval of scope and total. Charges the balance; preflight maxTotalPrice is not atomic. Multiple groups may partially succeed. Never automatically repeat a failed or timed-out batch.',
    schema: renewal.extend({ maxTotalPrice }),
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
    description:
      'Buy a short-term proxy quota package. This charges the balance; quote the package and total and obtain explicit confirmation first. Preflight maxTotalPrice is not atomic. Save the returned local order id for extraction. Never automatically retry.',
    schema: z.object({ num: serviceId, maxTotalPrice }).strict(),
    route: IP_SNAP_BUY_ROUTE,
    method: 'POST',
    consequential: true,
    reconcile,
    project: submitted
  }),
  serviceTool({
    name: 'nex_ip_snap_pull',
    description:
      'Consume purchased short-term quota to extract proxies. Requires explicit approval of the order, country and quantity. nexIpId is the local SNAP order ID. This is a consequential extraction, not a read; never automatically retry. Delivered proxies are already saved by the server.',
    schema: z
      .object({ nexIpId: serviceId, countryCode: z.string().regex(/^[A-Z]{2}$/), num: serviceId })
      .strict(),
    route: IP_SNAP_PULL_ROUTE,
    method: 'POST',
    consequential: true,
    reconcile,
    project: (data) => ({
      text: 'Extraction accepted. Refresh orders for remaining quota and nex_proxy_list to select proxy IDs.',
      data: { extractedCount: Array.isArray(data) ? data.length : 0 }
    })
  })
];

/** 将代理市场工具绑定到当前 MCP 客户端。 */
export function createIpTools(client: NexApiClient) {
  return bindTools(IP_TOOL_SPECS, { api: client, sessions: client });
}
