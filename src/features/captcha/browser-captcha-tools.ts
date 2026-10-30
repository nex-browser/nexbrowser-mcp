import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  assertCaptchaReady,
  captchaAdapterInput,
  readCaptchaContract,
  validateOnlineCaptchaAdapter,
  type CaptchaContract
} from './online-schema.js';
import { defineTool, type McpToolSpec, type ToolContext } from '../../shared/define-tool.js';
import { parseServiceJson } from '../../shared/service-tools.js';
import { apiErrorResult, errorResult, successResult } from '../../shared/tool-result.js';
import { PAID_TOOL_NOTE, resourceRecovery } from '../../shared/service-recovery.js';
import type { ActiveSessionStore, NexApiResponse } from '../../shared/types.js';
import {
  actionsRoute,
  CAPTCHA_BUY_ROUTE,
  CAPTCHA_PRODUCTS_ROUTE,
  CAPTCHA_QUERY_ROUTE
} from '../../transport/routes.js';
import { sessionId } from '../browser-automation/common.js';
import { automationSchema } from '../browser-automation/schema.js';

const gridOptions = z
  .object({
    root: z.string().min(1).max(1_000),
    tiles: z.string().min(1).max(1_000),
    instruction: z.string().min(1).max(1_000),
    verify: z.string().min(1).max(1_000),
    success: z.string().min(1).max(1_000).optional(),
    mode: z.enum(['auto', 'static', 'dynamic']).default('auto')
  })
  .strict();
type GridOptions = z.output<typeof gridOptions>;

interface Candidate {
  challengeId: string;
  documentId: string;
  productCode: string;
  adapter: Record<string, unknown>;
  ready: boolean;
  reason?: string;
  frameIndex: number;
  frameUrl: string;
  grid?: GridOptions & { fingerprint: string; contentKey: string; rows: number; columns: number };
}
interface Workflow {
  prepareId: string;
  sessionId: string;
  pageId: string;
  url: string;
  candidate: Candidate;
  productCode: string;
  contextId: string;
  expiresAt: number;
  challengeUrl?: string;
  attempted: boolean;
  busy: boolean;
  localId?: number;
  state?: string;
  applied?: boolean;
  lastQueryAt?: number;
  gridResult?: Record<string, unknown>;
  nextPrepareId?: string;
}
const workflows = new WeakMap<ActiveSessionStore, Map<string, Workflow>>();
const queryTimes = new WeakMap<ActiveSessionStore, number[]>();

/** 状态只属于当前 MCP 客户端；重启后的未知扣费必须通过记录和账单核对。 */
function storeFor(ctx: ToolContext) {
  let store = workflows.get(ctx.sessions);
  if (!store) workflows.set(ctx.sessions, (store = new Map()));
  return store;
}

/** 仅兼容已支持的 Turnstile 旧产品码，优先使用目录中的精确匹配。 */
function enabledProduct(catalog: unknown, productCode: string) {
  if (!Array.isArray(catalog)) return undefined;
  const exact = catalog.find((row: any) => row.productCode === productCode);
  if (exact) return exact;
  const alias =
    productCode === 'TURNSTILE'
      ? 'CLOUDFLARE_TURNSTILE'
      : productCode === 'CLOUDFLARE_TURNSTILE'
        ? 'TURNSTILE'
        : undefined;
  return alias ? catalog.find((row: any) => row.productCode === alias) : undefined;
}

/** 只保留已实现的页面桥接；产品参数全部按本次在线 Schema 校验。 */
function browserAdapter(
  candidate: Candidate,
  contract: CaptchaContract,
  awaitingFreshChallenge = false
) {
  const code =
    candidate.productCode === 'TURNSTILE' ? 'CLOUDFLARE_TURNSTILE' : candidate.productCode;
  if (
    ![
      'GRID',
      'GEETEST',
      'GEETEST_V4',
      'RECAPTCHA_V2',
      'RECAPTCHA_V2_ENTERPRISE',
      'CLOUDFLARE_TURNSTILE'
    ].includes(code)
  )
    return { reason: 'This product has no supported automatic browser CAPTCHA adapter.' };
  if (
    code === 'GRID' &&
    (!candidate.grid ||
      contract.integration.resultKind !== 'GRID_CELLS' ||
      contract.integration.indexBase !== 1 ||
      contract.integration.order !== 'ROW_MAJOR')
  )
    return {
      reason: 'GRID requires a captured grid and a documented 1-based ROW_MAJOR result contract.'
    };
  const adapter = { ...candidate.adapter };
  if (code === 'GRID' && candidate.grid) {
    const properties = contract.schema.properties as Record<string, unknown> | undefined;
    const enriched = { ...adapter };
    const options = {
      rows: candidate.grid.rows,
      columns: candidate.grid.columns,
      canNoAnswer: 1
    };
    for (const [key, value] of Object.entries(options)) {
      if (properties && Object.hasOwn(properties, key) && !Object.hasOwn(adapter, key))
        enriched[key] = value;
    }
    try {
      validateOnlineCaptchaAdapter(contract, enriched);
      Object.assign(adapter, enriched);
    } catch {
      // 可选增强不符合完整在线约束时保留原参数，仍由下方完整校验决定能否购买。
    }
  }
  if (code === 'GEETEST' && Object.hasOwn(adapter, 'geetestApiServerSubdomain')) {
    if (
      adapter.apiServerSubdomain !== undefined &&
      adapter.apiServerSubdomain !== adapter.geetestApiServerSubdomain
    )
      return {
        reason: 'Conflicting GeeTest apiServerSubdomain fields; inspect the current widget.'
      };
    adapter.apiServerSubdomain = adapter.geetestApiServerSubdomain;
    delete adapter.geetestApiServerSubdomain;
  }
  // 旧桥接附带的 UA 仅在线规则明确不接受时移除，不维护固定产品字段表。
  if (
    code === 'CLOUDFLARE_TURNSTILE' &&
    contract.schema.additionalProperties === false &&
    !(contract.schema.properties as Record<string, unknown> | undefined)?.userAgent
  )
    delete adapter.userAgent;
  try {
    captchaAdapterInput.parse(adapter);
    // GeeTest v3 的新 challenge 在提交前获取，完整线上校验推迟到刷新完成后。
    if (!awaitingFreshChallenge) validateOnlineCaptchaAdapter(contract, adapter);
  } catch (error) {
    return {
      reason: error instanceof Error ? error.message : 'Online CAPTCHA contract validation failed.'
    };
  }
  return { adapter };
}

/** 每一步服务读取都绑定准备时的用户和团队版本，禁止切团队后续用旧任务。 */
class CaptchaServiceError extends Error {
  constructor(readonly response: NexApiResponse) {
    super(`NexCaptcha request failed (${response.code}): ${response.msg}`);
  }
}
async function service(ctx: ToolContext, route: string, contextId?: string, body?: unknown) {
  const response = await ctx.api.request<any>(route, {
    method: body === undefined ? 'GET' : 'POST',
    ...(contextId ? { headers: { 'X-Nex-Service-Context': contextId } } : {}),
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (response.code !== 0) throw new CaptchaServiceError(response);
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
    workflow.candidate.grid
      ? {
          grid: gridOptions.parse(
            workflow.candidate.grid && {
              root: workflow.candidate.grid.root,
              tiles: workflow.candidate.grid.tiles,
              instruction: workflow.candidate.grid.instruction,
              verify: workflow.candidate.grid.verify,
              success: workflow.candidate.grid.success,
              mode: workflow.candidate.grid.mode
            }
          )
        }
      : {},
    workflow.contextId
  );
  const row = page.candidates?.find(
    (item: Candidate) => item.challengeId === workflow.candidate.challengeId
  );
  if (
    page.pageId !== workflow.pageId ||
    page.url !== workflow.url ||
    !row ||
    row.productCode !== workflow.candidate.productCode ||
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
      state: workflow.state ?? 'PREPARED',
      applied: workflow.applied ?? false,
      websiteVerified: false,
      ...(['FAILED', 'EXPIRED'].includes(workflow.state ?? '')
        ? {
            recovery: resourceRecovery(
              'captcha',
              'RETRY_CHALLENGE',
              'CONFIRMED_SOLVER_FAILURE',
              workflow.localId ?? workflow.prepareId
            )
          }
        : workflow.state === 'OUTCOME_UNKNOWN' || workflow.state === 'APPLY_OUTCOME_UNKNOWN'
          ? {
              recovery: resourceRecovery(
                'captcha',
                'RECONCILE',
                'OUTCOME_UNKNOWN',
                workflow.localId ?? workflow.prepareId
              )
            }
          : {}),
      ...workflow.gridResult,
      ...(workflow.nextPrepareId ? { nextPrepareId: workflow.nextPrepareId } : {}),
      ...extra
    }
  );
}

/** This invocation stopped before submitting any purchase RPC. */
function preparationRequired(message: string, prepareId: string, retryAfterMs?: number) {
  return errorResult(`No purchase attempted. ${message}`, {
    code: 'CAPTCHA_PREPARATION_REQUIRED',
    purchaseAttempted: false,
    prepareId,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    recovery: resourceRecovery('captcha', 'RETRY_CHALLENGE', 'PREPARATION_REQUIRED', prepareId)
  });
}

/** 网格图片不进入对话；仅展示题目、布局和准备状态。 */
function publicCandidate(candidate: Candidate) {
  if (candidate.productCode !== 'GRID') return candidate;
  return {
    ...candidate,
    adapter: { comment: candidate.adapter.comment },
    grid: candidate.grid && {
      rows: candidate.grid.rows,
      columns: candidate.grid.columns,
      mode: candidate.grid.mode
    }
  };
}

/** 后续轮次只准备挑战；显式调用新的 submit 才会购买，避免重复扣费。 */
async function gridProgress(ctx: ToolContext, workflow: Workflow, result: any) {
  workflow.gridResult = {
    gridState: result.gridState,
    websiteVerified: result.websiteVerified === true,
    retryAfterMs: result.retryAfterMs,
    guidance: result.guidance
  };
  if (result.gridState === 'NEXT_ROUND' && result.nextCandidate && !workflow.nextPrepareId) {
    const grid = workflow.candidate.grid!;
    const prepared = await BROWSER_CAPTCHA_TOOL_SPECS[0]!.execute(
      {
        sessionId: workflow.sessionId,
        pageId: workflow.pageId,
        challengeId: result.nextCandidate.challengeId,
        grid: {
          root: grid.root,
          tiles: grid.tiles,
          instruction: grid.instruction,
          verify: grid.verify,
          success: grid.success,
          mode: grid.mode
        }
      },
      ctx
    );
    const preparation = prepared.structuredContent;
    if (preparation?.ready === true) {
      const next = storeFor(ctx).get(String(preparation.prepareId));
      if (next?.contextId !== workflow.contextId)
        throw new Error('Grid team context changed before next preparation');
      workflow.nextPrepareId = String(preparation.prepareId);
      workflow.gridResult.nextPreparation = preparation;
    } else {
      workflow.gridResult.guidance =
        'The new Grid is not ready. Prepare the current round again without purchasing.';
    }
  }
  return status(workflow);
}

export const BROWSER_CAPTCHA_TOOL_SPECS: readonly McpToolSpec[] = [
  defineTool({
    name: 'nex_browser_captcha_prepare',
    description:
      'Free, no purchase: capture the page CAPTCHA and check product availability and the online schema. Supports captured GeeTest v3/v4, reCAPTCHA v2/enterprise with an associated callback and Turnstile, and real image grids (reCAPTCHA grids are detected; for other grids pass the observed grid selectors and mode). Canvas or custom widgets need a site adapter. Updated Desktop recovers existing and implicit reCAPTCHA widgets when their callback is associated. Pass challengeId when several widgets exist. Missing parameters, an uncaptured callback, HTTP 403 or a timeout are blockers to report, not reasons to switch to GRID or raw nex_captcha_buy. Never silently reload a filled form. When ready, call nex_browser_captcha_submit.',
    inputSchema: automationSchema({
      challengeId: z.string().optional(),
      challengeUrl: z.string().url().optional(),
      grid: gridOptions.optional()
    }),
    execute: async (args, ctx) => {
      const catalog = await service(ctx, CAPTCHA_PRODUCTS_ROUTE);
      const sid = sessionId(args, ctx.sessions);
      const page = await action(
        ctx,
        sid,
        args.pageId,
        'captchaInspect',
        args.grid ? { grid: args.grid } : {},
        catalog.contextId
      );
      const candidates: Candidate[] = page.candidates ?? [];
      const publicPage = { ...page, candidates: candidates.map(publicCandidate) };
      const selected = args.challengeId
        ? candidates.find((row) => row.challengeId === args.challengeId)
        : candidates.length === 1
          ? candidates[0]
          : undefined;
      if (!selected)
        return successResult(
          'No unique captured CAPTCHA. Select challengeId or arm capture before navigation. Reinitializing an existing filled form requires user approval.',
          { ...publicPage, products: catalog.data, ready: false }
        );
      const product = enabledProduct(catalog.data, selected.productCode);
      const needsFreshChallenge =
        selected.productCode === 'GEETEST' &&
        selected.reason?.startsWith('Fresh challenge required');
      if (!product || (!selected.ready && !(needsFreshChallenge && args.challengeUrl))) {
        return successResult(
          product
            ? (selected.reason ?? 'CAPTCHA is not ready')
            : 'This CAPTCHA product is not currently enabled in NexCaptcha',
          { ...publicPage, ready: false, product }
        );
      }
      const { contract } = await readCaptchaContract(ctx, product.productCode, catalog.contextId);
      assertCaptchaReady(contract, selected.productCode === 'GRID' ? 'BROWSER_INTERACTION' : true);
      const preparedAdapter = browserAdapter(
        selected,
        contract,
        Boolean(needsFreshChallenge && args.challengeUrl)
      );
      if (preparedAdapter.reason)
        return successResult(preparedAdapter.reason, {
          pageId: page.pageId,
          challengeId: selected.challengeId,
          productCode: product.productCode,
          ready: false,
          reason: preparedAdapter.reason
        });
      if (!page.pageId) throw new Error('Missing stable CAPTCHA page ID');
      if (
        !['https:', 'http:'].includes(
          new URL(String(selected.productCode === 'GRID' ? page.url : selected.adapter.websiteURL))
            .protocol
        )
      )
        throw new Error('CAPTCHA websiteURL must be an HTTP(S) site URL');
      const store = storeFor(ctx);
      const previous = [...store.values()].find(
        (row) =>
          row.candidate.documentId === selected.documentId &&
          (row.candidate.challengeId === selected.challengeId ||
            (row.candidate.productCode === selected.productCode &&
              row.candidate.frameIndex === selected.frameIndex &&
              row.candidate.frameUrl === selected.frameUrl &&
              row.attempted &&
              !row.applied &&
              !['FAILED', 'EXPIRED'].includes(row.state ?? '')))
      );
      if (previous && previous.contextId !== catalog.contextId)
        throw new Error(
          'This CAPTCHA belongs to a different identity/team revision; do not repurchase it'
        );
      if (previous?.attempted || previous?.busy) {
        if (
          !previous.busy &&
          previous.candidate.challengeId === selected.challengeId &&
          previous.url === page.url &&
          previous.candidate.productCode === selected.productCode &&
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
      // 未购买的准备状态可淘汰；已尝试任务保留，防止新 prepare 绕过重复扣费保护。
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
        productCode: product.productCode,
        contextId: catalog.contextId,
        expiresAt: Date.now() + 120_000,
        challengeUrl: args.challengeUrl,
        attempted: false,
        busy: false
      };
      store.set(workflow.prepareId, workflow);
      return successResult(
        `NexCaptcha ${workflow.productCode} challenge is ready. Call nex_browser_captcha_submit with this prepareId to create one task and charge the balance directly, then nex_browser_captcha_complete to apply the result. No separate payment confirmation is needed.`,
        {
          prepareId: workflow.prepareId,
          productCode: workflow.productCode,
          ready: true,
          expiresAt: workflow.expiresAt,
          adapter:
            selected.productCode === 'GRID'
              ? { comment: selected.adapter.comment }
              : preparedAdapter.adapter,
          ...(selected.grid
            ? {
                grid: {
                  rows: selected.grid.rows,
                  columns: selected.grid.columns,
                  mode: selected.grid.mode
                }
              }
            : {}),
          contract
        }
      );
    }
  }),
  defineTool({
    name: 'nex_browser_captcha_submit',
    description: `Submit a prepared page CAPTCHA once, then call nex_browser_captcha_complete with the same prepareId. Rechecks the product, team, page and current Grid image; each Grid round has its own prepareId. Never resubmit after a timeout. Does not click the final sign-up/login button. ${PAID_TOOL_NOTE}`,
    annotations: { destructiveHint: true, idempotentHint: false },
    inputSchema: z.object({ prepareId: z.string() }).strict(),
    execute: async (args, ctx) => {
      const workflow = storeFor(ctx).get(args.prepareId);
      if (!workflow)
        return preparationRequired(
          'Unknown prepareId; prepare the current challenge.',
          args.prepareId
        );
      if (workflow.attempted) {
        await service(ctx, CAPTCHA_PRODUCTS_ROUTE, workflow.contextId);
        return status(workflow);
      }
      if (workflow.busy)
        return preparationRequired(
          'CAPTCHA workflow is busy; wait before preparing/submitting again.',
          workflow.prepareId,
          1_000
        );
      if (Date.now() > workflow.expiresAt)
        return preparationRequired(
          'CAPTCHA preparation expired; prepare again before buying.',
          workflow.prepareId
        );
      workflow.busy = true;
      try {
        const catalog = await service(ctx, CAPTCHA_PRODUCTS_ROUTE, workflow.contextId);
        const product = catalog.data?.find((row: any) => row.productCode === workflow.productCode);
        if (!product) throw new Error('CAPTCHA product changed or is unavailable; prepare again');
        const { contract } = await readCaptchaContract(
          ctx,
          workflow.productCode,
          workflow.contextId
        );
        assertCaptchaReady(
          contract,
          workflow.productCode === 'GRID' ? 'BROWSER_INTERACTION' : true
        );
        let candidate = await current(ctx, workflow);
        const preflightAdapter = browserAdapter(
          candidate,
          contract,
          candidate.productCode === 'GEETEST' && Boolean(workflow.challengeUrl)
        );
        if (preflightAdapter.reason) throw new Error(preflightAdapter.reason);
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
        if (candidate.productCode !== workflow.candidate.productCode)
          throw new Error(
            'CAPTCHA refresh returned a different product; do not purchase this task'
          );
        if (!candidate.ready) throw new Error(candidate.reason ?? 'CAPTCHA challenge is not ready');
        const submittedAdapter = browserAdapter(candidate, contract);
        if (submittedAdapter.reason) throw new Error(submittedAdapter.reason);
        if (Date.now() > workflow.expiresAt)
          throw new Error(
            'CAPTCHA preparation expired during preflight; prepare again before buying'
          );
        workflow.attempted = true;
        workflow.state = 'OUTCOME_UNKNOWN';
        const created = await service(ctx, CAPTCHA_BUY_ROUTE, workflow.contextId, {
          productCode: workflow.productCode,
          adapter: submittedAdapter.adapter
        });
        const id = created.data?.id;
        if (
          !Number.isSafeInteger(id) ||
          id <= 0 ||
          created.data.productCode !== workflow.productCode
        )
          throw new Error(
            'Task creation did not return a matching local record; reconcile records/billing without retrying'
          );
        workflow.localId = id;
        workflow.state = created.data.state;
        return status(workflow);
      } catch (error) {
        if (error instanceof CaptchaServiceError) {
          const result = apiErrorResult('NexCaptcha request failed', error.response);
          if (result.structuredContent?.billingBlocked === true) {
            workflow.state = 'BILLING_BLOCKED';
            return workflow.attempted
              ? result
              : errorResult(String((result.content[0] as { text: string }).text), {
                  ...result.structuredContent,
                  purchaseAttempted: false
                });
          }
        }
        if (workflow.attempted)
          return errorResult(
            `CAPTCHA purchase outcome is unknown for prepareId=${workflow.prepareId}. Reconcile nex_captcha_record_list and nex_billing_trade_list; stop new charges until this outcome is established.`,
            {
              code: 'CAPTCHA_PURCHASE_OUTCOME_UNKNOWN',
              prepareId: workflow.prepareId,
              recovery: resourceRecovery(
                'captcha',
                'RECONCILE',
                'PURCHASE_OUTCOME_UNKNOWN',
                workflow.prepareId
              )
            }
          );
        return preparationRequired(
          error instanceof Error
            ? error.message
            : 'CAPTCHA preflight failed; prepare the current challenge again.',
          workflow.prepareId
        );
      } finally {
        workflow.busy = false;
      }
    }
  }),
  defineTool({
    name: 'nex_browser_captcha_complete',
    description:
      'Query the task once; on SUCCEEDED apply the answer to the captured widget, or click the returned Grid tiles and the verify button. Poll pending tasks every 3–5 seconds. A changed Grid returns nextPrepareId without charging; submit it as the next round. REJECTED stops automatic new purchases; inspect the site verification response. Repeat calls only inspect progress and never click again. On FAILED/EXPIRED, check billing and prepare a fresh challenge, within 3 attempts. An unclear charge or application blocks new charges. Website acceptance needs page evidence; never clicks the final sign-up/login button.',
    annotations: { readOnlyHint: false, idempotentHint: false },
    inputSchema: z.object({ prepareId: z.string() }).strict(),
    execute: async (args, ctx) => {
      const workflow = storeFor(ctx).get(args.prepareId);
      if (!workflow?.localId)
        throw new Error(
          'No known local task ID. Reconcile records and billing; never automatically repeat the purchase'
        );
      if (workflow.productCode === 'GRID' && workflow.applied && !workflow.nextPrepareId) {
        if (workflow.busy) throw new Error('CAPTCHA workflow is busy');
        workflow.busy = true;
        try {
          await service(ctx, CAPTCHA_PRODUCTS_ROUTE, workflow.contextId);
          const progress = await action(
            ctx,
            workflow.sessionId,
            workflow.pageId,
            'captchaApply',
            { ...workflow.candidate, adapter: undefined, gridProgress: true },
            workflow.contextId
          );
          return await gridProgress(ctx, workflow, progress);
        } finally {
          workflow.busy = false;
        }
      }
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
        if (record?.id !== workflow.localId || record.productCode !== workflow.productCode)
          throw new Error('NexCaptcha task identity/product mismatch');
        workflow.state = record.state;
        if (record.state !== 'SUCCEEDED')
          return status(workflow, {
            retryAfterMs: ['FAILED', 'EXPIRED'].includes(record.state) ? undefined : 3_000,
            guidance: ['FAILED', 'EXPIRED'].includes(record.state)
              ? 'Recognition definitively failed. Check records/billing, refresh the widget through its supported visible controls, then prepare and submit a genuinely new challenge without another payment confirmation, up to 3 attempts including the first. Do not repurchase the same challenge or repeat an unknown purchase/application.'
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
            ...(workflow.productCode === 'GRID' ? { adapter: undefined } : {}),
            solution: parseServiceJson(record.solution, {})
          },
          workflow.contextId
        );
        workflow.applied = applied.applied === true;
        workflow.state = workflow.applied ? 'APPLIED' : 'APPLY_OUTCOME_UNKNOWN';
        if (workflow.productCode === 'GRID' && workflow.applied)
          return await gridProgress(ctx, workflow, applied);
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
