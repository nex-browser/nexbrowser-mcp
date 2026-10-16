import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { defineTool, type ToolContext } from '../../shared/define-tool.js';
import { maxTotalPrice, parseServiceJson } from '../../shared/service-tools.js';
import { successResult } from '../../shared/tool-result.js';
import type { ActiveSessionStore } from '../../shared/types.js';
import {
  actionsRoute,
  CAPTCHA_BUY_ROUTE,
  CAPTCHA_PRODUCTS_ROUTE,
  CAPTCHA_QUERY_ROUTE
} from '../../transport/routes.js';
import { sessionId } from '../browser-automation/common.js';
import { automationSchema } from '../browser-automation/schema.js';

interface Candidate {
  challengeId: string;
  documentId: string;
  productCode: string;
  adapter: Record<string, unknown>;
  ready: boolean;
  reason?: string;
  frameIndex: number;
  frameUrl: string;
}
interface Workflow {
  prepareId: string;
  sessionId: string;
  pageId: string;
  url: string;
  candidate: Candidate;
  contextId: string;
  price: string;
  expiresAt: number;
  challengeUrl?: string;
  attempted: boolean;
  busy: boolean;
  localId?: number;
  state?: string;
  applied?: boolean;
  lastQueryAt?: number;
}
const workflows = new WeakMap<ActiveSessionStore, Map<string, Workflow>>();
const queryTimes = new WeakMap<ActiveSessionStore, number[]>();

/** 状态只属于当前 MCP 客户端；重启后的未知扣费必须通过记录和账单核对。 */
function storeFor(ctx: ToolContext) {
  let store = workflows.get(ctx.sessions);
  if (!store) workflows.set(ctx.sessions, (store = new Map()));
  return store;
}

/** 用十进制定点整数比较报价，避免浮点边界放宽扣费上限。 */
function amount(value: unknown) {
  const text = String(value);
  if (!/^\d+(?:\.\d+)?$/.test(text) || text.length > 64) throw new Error('Invalid CAPTCHA price');
  const [whole, fraction = ''] = text.split('.');
  return { digits: BigInt(whole + fraction), scale: fraction.length };
}
/** 将不同精度的金额对齐后比较，不修改服务端给出的应付价格。 */
function comparePrice(left: unknown, right: unknown) {
  const a = amount(left);
  const b = amount(right);
  const scale = Math.max(a.scale, b.scale);
  const x = a.digits * 10n ** BigInt(scale - a.scale);
  const y = b.digits * 10n ** BigInt(scale - b.scale);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** 每一步服务读取都绑定报价时的用户和团队版本，禁止切团队后续用旧任务。 */
async function service(ctx: ToolContext, route: string, contextId?: string, body?: unknown) {
  const response = await ctx.api.request<any>(route, {
    method: body === undefined ? 'GET' : 'POST',
    ...(contextId ? { headers: { 'X-Nex-Service-Context': contextId } } : {}),
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (response.code !== 0)
    throw new Error(`NexCaptcha request failed (${response.code}): ${response.msg}`);
  if (!response.contextId || (contextId && response.contextId !== contextId))
    throw new Error(
      'Service identity/team context changed or is unavailable; prepare again without purchasing'
    );
  return { data: response.data, contextId: response.contextId };
}

/** 调用固定页面动作，不借用任意脚本执行权限。 */
async function action(
  ctx: ToolContext,
  sid: string,
  pageId: string | undefined,
  name: string,
  params = {},
  contextId?: string
) {
  const response = await ctx.api.request<any>(actionsRoute(sid), {
    method: 'POST',
    ...(contextId ? { headers: { 'X-Nex-Service-Context': contextId } } : {}),
    body: JSON.stringify({ action: name, pageId, params })
  });
  if (response.code !== 0)
    throw new Error(`CAPTCHA browser action failed (${response.code}): ${response.msg}`);
  if (!response.data?.result) throw new Error('CAPTCHA browser action returned no result');
  return response.data.result;
}

/** 在购买和回填前重新确认同一个页面、文档、iframe 与挑战。 */
async function current(ctx: ToolContext, workflow: Workflow) {
  const page = await action(
    ctx,
    workflow.sessionId,
    workflow.pageId,
    'captchaInspect',
    {},
    workflow.contextId
  );
  const row = page.candidates?.find(
    (item: Candidate) => item.challengeId === workflow.candidate.challengeId
  );
  if (
    page.pageId !== workflow.pageId ||
    page.url !== workflow.url ||
    !row ||
    row.documentId !== workflow.candidate.documentId ||
    row.frameIndex !== workflow.candidate.frameIndex ||
    row.frameUrl !== workflow.candidate.frameUrl
  ) {
    throw new Error(
      'CAPTCHA page/document/challenge changed; do not reuse this task or automatically buy another'
    );
  }
  return row as Candidate;
}

/** 返回状态和本地任务 ID，不把验证码答案带入对话或日志。 */
function status(workflow: Workflow, extra: Record<string, unknown> = {}) {
  return successResult(
    'NexCaptcha workflow status. Never repeat a purchase after an unknown outcome; reconcile nex_captcha_record_list and nex_billing_trade_list.',
    {
      prepareId: workflow.prepareId,
      localId: workflow.localId,
      state: workflow.state ?? 'QUOTED',
      applied: workflow.applied ?? false,
      websiteVerified: false,
      ...extra
    }
  );
}

export const BROWSER_CAPTCHA_TOOL_SPECS = [
  defineTool({
    name: 'nex_browser_captcha_prepare',
    description:
      'First check enabled NexCaptcha products/prices, then collect page CAPTCHA parameters and callback. Free: never creates a paid task. Call before navigating to a registration page to arm capture. Supports captured GeeTest v3/v4, explicit reCAPTCHA v2 and Turnstile; unsupported/uncaptured widgets return actionable blockers. Select challengeId if multiple widgets exist. Quote the returned USDT fee and obtain explicit confirmation before submit. Never silently reload a filled form.',
    inputSchema: automationSchema({
      challengeId: z.string().optional(),
      challengeUrl: z.string().url().optional()
    }),
    execute: async (args, ctx) => {
      const catalog = await service(ctx, CAPTCHA_PRODUCTS_ROUTE);
      const sid = sessionId(args, ctx.sessions);
      const page = await action(ctx, sid, args.pageId, 'captchaInspect', {}, catalog.contextId);
      const candidates: Candidate[] = page.candidates ?? [];
      const selected = args.challengeId
        ? candidates.find((row) => row.challengeId === args.challengeId)
        : candidates.length === 1
          ? candidates[0]
          : undefined;
      if (!selected)
        return successResult(
          'No unique captured CAPTCHA. Select challengeId or arm capture before navigation. Reinitializing an existing filled form requires user approval.',
          { ...page, products: catalog.data, ready: false }
        );
      const product = Array.isArray(catalog.data)
        ? catalog.data.find((row: any) => row.productCode === selected.productCode)
        : undefined;
      const needsFreshChallenge =
        selected.productCode === 'GEETEST' &&
        selected.reason?.startsWith('Fresh challenge required');
      if (!product || (!selected.ready && !(needsFreshChallenge && args.challengeUrl))) {
        return successResult(
          product
            ? (selected.reason ?? 'CAPTCHA is not ready')
            : 'This CAPTCHA product is not currently enabled in NexCaptcha',
          { ...page, ready: false, product }
        );
      }
      if (!page.pageId) throw new Error('Missing stable CAPTCHA page ID');
      if (!['https:', 'http:'].includes(new URL(String(selected.adapter.websiteURL)).protocol))
        throw new Error('CAPTCHA websiteURL must be an HTTP(S) site URL');
      amount(product.price);
      const store = storeFor(ctx);
      const previous = [...store.values()].find(
        (row) =>
          row.candidate.challengeId === selected.challengeId &&
          row.candidate.documentId === selected.documentId
      );
      if (previous && previous.contextId !== catalog.contextId)
        throw new Error(
          'This CAPTCHA belongs to a different identity/team revision; do not repurchase it'
        );
      if (previous?.attempted || previous?.busy) {
        if (
          !previous.busy &&
          previous.url === page.url &&
          previous.candidate.frameUrl === selected.frameUrl
        ) {
          previous.sessionId = sid;
          previous.pageId = page.pageId;
          previous.candidate = selected;
        }
        return status(previous, {
          ready: false,
          reason:
            'This challenge already has an active purchase workflow. Query/complete or reconcile it; do not buy again.'
        });
      }
      // 未购买报价可淘汰；已尝试任务保留，防止新 prepare 绕过重复扣费保护。
      for (const [id, row] of store)
        if (!row.attempted && row.expiresAt < Date.now()) store.delete(id);
      if (previous) store.delete(previous.prepareId);
      if (store.size >= 128)
        throw new Error(
          'CAPTCHA workflow capacity reached; reconcile existing tasks before restarting the MCP client'
        );
      const workflow: Workflow = {
        prepareId: randomUUID(),
        sessionId: sid,
        pageId: page.pageId,
        url: page.url,
        candidate: selected,
        contextId: catalog.contextId,
        price: String(product.price),
        expiresAt: Date.now() + 120_000,
        challengeUrl: args.challengeUrl,
        attempted: false,
        busy: false
      };
      store.set(workflow.prepareId, workflow);
      return successResult(
        `NexCaptcha ${selected.productCode}: ${workflow.price} USDT for one task. Ask the user to explicitly approve this fee, sending the public CAPTCHA parameters to the service and dispatching the site callback, which may send verification requests or submit a site form.`,
        {
          prepareId: workflow.prepareId,
          productCode: selected.productCode,
          price: workflow.price,
          currency: 'USDT',
          ready: true,
          expiresAt: workflow.expiresAt,
          adapter: selected.adapter,
          requiresConfirmation: true
        }
      );
    }
  }),
  defineTool({
    name: 'nex_browser_captcha_submit',
    description:
      'After explicit user approval of the prepared product, single-task USDT fee and site callback dispatch, submit exactly once. confirmed=true records approval; maxTotalPrice must be the approved ceiling. Rechecks product price, team and page challenge. A timeout is an unknown charged outcome: never automatically purchase again. Saves the local task ID for complete. This does not click the final signup/login button.',
    annotations: { destructiveHint: true, idempotentHint: false },
    inputSchema: z
      .object({ prepareId: z.string(), confirmed: z.literal(true), maxTotalPrice })
      .strict(),
    execute: async (args, ctx) => {
      const workflow = storeFor(ctx).get(args.prepareId);
      if (!workflow) throw new Error('Unknown prepareId; prepare a fresh quote');
      if (workflow.attempted) {
        await service(ctx, CAPTCHA_PRODUCTS_ROUTE, workflow.contextId);
        return status(workflow);
      }
      if (workflow.busy) throw new Error('CAPTCHA workflow is busy');
      if (Date.now() > workflow.expiresAt)
        throw new Error('CAPTCHA quote expired; prepare again before buying');
      workflow.busy = true;
      try {
        if (comparePrice(workflow.price, args.maxTotalPrice) > 0)
          throw new Error('Approved price ceiling is below the quote');
        const catalog = await service(ctx, CAPTCHA_PRODUCTS_ROUTE, workflow.contextId);
        const product = catalog.data?.find(
          (row: any) => row.productCode === workflow.candidate.productCode
        );
        if (!product || comparePrice(product.price, workflow.price) !== 0)
          throw new Error('CAPTCHA price/product changed; obtain approval for a new quote');
        let candidate = await current(ctx, workflow);
        if (candidate.productCode === 'GEETEST') {
          candidate = await action(
            ctx,
            workflow.sessionId,
            workflow.pageId,
            'captchaRefresh',
            {
              ...workflow.candidate,
              challengeUrl: workflow.challengeUrl
            },
            workflow.contextId
          );
        }
        if (!candidate.ready) throw new Error(candidate.reason ?? 'CAPTCHA challenge is not ready');
        if (Date.now() > workflow.expiresAt)
          throw new Error('CAPTCHA quote expired during preflight; prepare again before buying');
        workflow.attempted = true;
        workflow.state = 'OUTCOME_UNKNOWN';
        const created = await service(ctx, CAPTCHA_BUY_ROUTE, workflow.contextId, {
          productCode: candidate.productCode,
          adapter: candidate.adapter,
          maxTotalPrice: workflow.price
        });
        const id = created.data?.id;
        if (
          !Number.isSafeInteger(id) ||
          id <= 0 ||
          created.data.productCode !== candidate.productCode
        )
          throw new Error(
            'Task creation did not return a matching local record; reconcile records/billing without retrying'
          );
        workflow.localId = id;
        workflow.state = created.data.state;
        return status(workflow);
      } catch (error) {
        if (workflow.attempted)
          throw new Error(
            `CAPTCHA purchase outcome is unknown for prepareId=${workflow.prepareId}. Reconcile nex_captcha_record_list and nex_billing_trade_list; never automatically retry. ${error instanceof Error ? error.message : 'Request failed'}`
          );
        throw error;
      } finally {
        workflow.busy = false;
      }
    }
  }),
  defineTool({
    name: 'nex_browser_captcha_complete',
    description:
      'Query the prepared task once and, on SUCCEEDED, dispatch its validated solution to the original page widget callback. The callback may send verification requests or submit a site form; obtain authorization for that scope first. Pending results require another call after 3–5 seconds; no background polling or new purchases. Stops on FAILED/EXPIRED and asks to verify refunds in billing. Never equates callback dispatch with website acceptance: inspect a fresh page snapshot/site verification response. Does not click the final signup/login button.',
    annotations: { readOnlyHint: false, idempotentHint: false },
    inputSchema: z.object({ prepareId: z.string() }).strict(),
    execute: async (args, ctx) => {
      const workflow = storeFor(ctx).get(args.prepareId);
      if (!workflow?.localId)
        throw new Error(
          'No known local task ID. Reconcile records and billing; never automatically repeat the purchase'
        );
      if (
        workflow.applied ||
        ['FAILED', 'EXPIRED', 'APPLY_OUTCOME_UNKNOWN'].includes(workflow.state ?? '')
      ) {
        await service(ctx, CAPTCHA_PRODUCTS_ROUTE, workflow.contextId);
        return status(workflow);
      }
      if (workflow.busy) throw new Error('CAPTCHA workflow is busy');
      if (workflow.lastQueryAt && Date.now() - workflow.lastQueryAt < 3_000)
        return status(workflow, { retryAfterMs: 3_000 - (Date.now() - workflow.lastQueryAt) });
      const recent = (queryTimes.get(ctx.sessions) ?? []).filter(
        (time) => Date.now() - time < 3_000
      );
      if (recent.length >= 5)
        return status(workflow, { retryAfterMs: 3_000 - (Date.now() - recent[0]!) });
      queryTimes.set(ctx.sessions, [...recent, Date.now()]);
      workflow.busy = true;
      try {
        workflow.lastQueryAt = Date.now();
        const queried = await service(ctx, CAPTCHA_QUERY_ROUTE, workflow.contextId, {
          id: workflow.localId
        });
        const record = queried.data;
        if (
          record?.id !== workflow.localId ||
          record.productCode !== workflow.candidate.productCode
        )
          throw new Error('NexCaptcha task identity/product mismatch');
        workflow.state = record.state;
        if (record.state !== 'SUCCEEDED')
          return status(workflow, {
            retryAfterMs: ['FAILED', 'EXPIRED'].includes(record.state) ? undefined : 3_000,
            guidance: ['FAILED', 'EXPIRED'].includes(record.state)
              ? 'Stop. Verify refund via nex_billing_trade_list; do not automatically purchase another task.'
              : 'Still pending or unknown. Query only when needed after 3–5 seconds.'
          });
        const candidate = await current(ctx, workflow);
        if (!candidate.ready) throw new Error(candidate.reason ?? 'CAPTCHA expired');
        workflow.state = 'APPLY_OUTCOME_UNKNOWN';
        const applied = await action(
          ctx,
          workflow.sessionId,
          workflow.pageId,
          'captchaApply',
          {
            ...workflow.candidate,
            solution: parseServiceJson(record.solution, {})
          },
          workflow.contextId
        );
        workflow.applied = applied.applied === true;
        workflow.state = workflow.applied ? 'APPLIED' : 'APPLY_OUTCOME_UNKNOWN';
        return status(workflow, { guidance: applied.guidance });
      } catch (error) {
        if (workflow.state === 'APPLY_OUTCOME_UNKNOWN')
          throw new Error(
            `CAPTCHA callback outcome is unknown. Inspect the page/site response; do not dispatch again or purchase again. ${error instanceof Error ? error.message : 'Request failed'}`
          );
        throw error;
      } finally {
        workflow.busy = false;
      }
    }
  })
];
