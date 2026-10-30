import { z } from 'zod';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { defineTool, type McpToolSpec } from '../../shared/define-tool.js';
import { apiErrorResult, errorResult, successResult } from '../../shared/tool-result.js';
import { parseServiceJson, serviceId } from '../../shared/service-tools.js';
import { CAPTCHA_PRODUCTS_ROUTE, CAPTCHA_QUERY_ROUTE } from '../../transport/routes.js';
import {
  assertCaptchaReady,
  captchaAdapterInput,
  captchaProductCode,
  readCaptchaContract,
  validateOnlineCaptchaAdapter
} from './online-schema.js';
import { inspectCaptchaHtml, type CaptchaObservation } from './agent-captcha-html.js';
import { captchaTaskBinding, sameCaptchaUrl } from './agent-captcha-state.js';
import { buildCaptchaApplication } from './agent-captcha-application.js';
import { captchaWorkflow, planAgentCaptcha } from './agent-captcha-plan.js';

const pageUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  }, 'Use the actual HTTP(S) page URL without credentials.');

/** Enterprise 的可选 s 无映射时提示省略，其他未支持的输入仍阻塞。 */
function observedAdapter(
  observation: CaptchaObservation,
  url: string,
  properties: Record<string, unknown>
) {
  const adapter: Record<string, unknown> = { websiteURL: url, websiteKey: observation.websiteKey };
  const unsupported: string[] = [];
  const warnings: string[] = [];
  const fields = observation.fields;
  if (observation.productCode.startsWith('RECAPTCHA_')) {
    if (fields.size) adapter.isInvisible = fields.size === 'invisible';
    if (properties.isEnterprise)
      adapter.isEnterprise = observation.productCode === 'RECAPTCHA_V2_ENTERPRISE';
    if (fields.s) {
      if (observation.productCode === 'RECAPTCHA_V2_ENTERPRISE' && properties.enterprisePayload)
        adapter.enterprisePayload = { s: fields.s };
      else if (properties.recaptchaDataSValue) adapter.recaptchaDataSValue = fields.s;
      else if (properties.s) adapter.s = fields.s;
      else if (observation.productCode === 'RECAPTCHA_V2_ENTERPRISE')
        warnings.push(
          'Observed Enterprise s is omitted because the current online contract has no supported field for it. Website acceptance is not guaranteed.'
        );
      else unsupported.push('s');
    }
    if (fields.action) {
      if (properties.pageAction) adapter.pageAction = fields.action;
      else if (properties.action) adapter.action = fields.action;
      else unsupported.push('action');
    }
  } else {
    for (const [source, target] of [
      ['action', 'action'],
      ['cdata', 'data'],
      ['chlpagedata', 'pagedata']
    ]) {
      if (!fields[source!]) continue;
      if (properties[target!]) adapter[target!] = fields[source!]!;
      else unsupported.push(source!);
    }
  }
  return { adapter, unsupported, warnings };
}

export const AGENT_CAPTCHA_TOOL_SPECS: readonly McpToolSpec[] = [
  defineTool({
    name: 'nex_captcha_detect',
    description:
      'Free, no purchase: plan agent integration for any enabled product using its current online schema, result contract and workflowGuide. Pass actual url, productCode and adapter; HTML is optional for explicit integration, including text answers, image coordinates and future products. Set workflow when needed and canApply=true only after verifying permitted tools can apply this result in the original page/frame (fill/click need no JavaScript permission). Without productCode, current HTML enables shortcut detection of reCAPTCHA v2/enterprise and Turnstile; HTML is parsed locally, never executed or sent to the solver. Captured observations are checked for conflicts. A missing fixed bridge or generated token script does not make a product unsupported. Missing required inputs, undocumented contracts and unavailable execution capabilities block purchase. Enterprise s is optional when unsupported by the online schema. Use returned nex_captcha_buy arguments, query the local id and apply the documented result with permitted tools; nex_captcha_apply_result is an optional token helper. Never guess inputs or bypass disabled permissions.',
    inputSchema: z
      .object({
        url: pageUrl,
        html: z.string().min(1).max(1_000_000).optional(),
        canApply: z.boolean().default(false),
        productCode: captchaProductCode.optional(),
        adapter: captchaAdapterInput.optional(),
        workflow: captchaWorkflow.optional()
      })
      .strict()
      .refine((args) => Boolean(args.html || args.productCode), {
        message:
          'Supply current HTML for detection or an exact productCode for explicit integration.'
      }),
    annotations: { readOnlyHint: true, idempotentHint: true },
    execute: async (args, ctx) => {
      const catalog = await ctx.api.request<any[]>(CAPTCHA_PRODUCTS_ROUTE);
      if (catalog.code !== 0)
        return apiErrorResult('CAPTCHA product lookup failed; no purchase attempted', catalog);
      if (!catalog.contextId)
        return errorResult('Service identity/team context is unavailable. No purchase attempted.');
      const observations = args.html ? inspectCaptchaHtml(args.html) : [];
      // 显式产品按通用契约接入；已检测的同类控件仍保留参数冲突和挑战绑定校验。
      const matchingObservation = observations.some(
        (row) =>
          row.productCode === args.productCode ||
          (row.productCode === 'CLOUDFLARE_TURNSTILE' && args.productCode === 'TURNSTILE')
      );
      if (args.productCode && !matchingObservation) {
        const product = Array.isArray(catalog.data)
          ? catalog.data.find((row) => row.productCode === args.productCode)
          : undefined;
        if (!product)
          return successResult('The selected product is not enabled in NexCaptcha.', {
            ready: false,
            route: 'AGENT',
            purchaseAttempted: false,
            candidates: []
          });
        const { contract } = await readCaptchaContract(ctx, product.productCode, catalog.contextId);
        const plan = planAgentCaptcha(contract, args);
        return successResult(
          'Explicit agent integration planned from the online contract. No task created.',
          {
            ...plan,
            candidates: [plan],
            detected: false
          }
        );
      }
      const candidates = [];
      for (const [index, observation] of observations.slice(0, 20).entries()) {
        if (
          args.productCode &&
          args.productCode !== observation.productCode &&
          !(observation.productCode === 'CLOUDFLARE_TURNSTILE' && args.productCode === 'TURNSTILE')
        )
          continue;
        const products = Array.isArray(catalog.data) ? catalog.data : [];
        const product =
          products.find(
            (row) => row.productCode === (args.productCode ?? observation.productCode)
          ) ??
          (!args.productCode && observation.productCode === 'CLOUDFLARE_TURNSTILE'
            ? products.find((row) => row.productCode === 'TURNSTILE')
            : undefined);
        const base = {
          candidateId: String(index + 1),
          productCode: product?.productCode ?? observation.productCode,
          selector: observation.selector
        };
        if (!product) {
          candidates.push({
            ...base,
            ready: false,
            reason: 'The observed product is not enabled in NexCaptcha.'
          });
          continue;
        }
        try {
          const { contract } = await readCaptchaContract(
            ctx,
            product.productCode,
            catalog.contextId
          );
          assertCaptchaReady(contract, true);
          const {
            adapter: observed,
            unsupported,
            warnings
          } = observedAdapter(
            observation,
            args.url,
            (contract.schema.properties ?? {}) as Record<string, unknown>
          );
          const adapter = { ...observed, ...args.adapter };
          const reasons: string[] = [];
          if (args.workflow && args.workflow !== 'BROWSER_RESULT')
            reasons.push(
              'The HTML/token shortcut uses BROWSER_RESULT. For another documented workflow, use explicit productCode/adapter without HTML; the requested workflow will not be silently replaced.'
            );
          if (contract.integration.resultKind !== 'TOKEN')
            reasons.push(
              'The current result contract is not TOKEN. Read its resultGuide, then use explicit productCode/adapter without HTML for agent integration; this token helper is not a product restriction.'
            );
          if (
            Object.entries(observed).some(
              ([key, value]) =>
                value !== undefined &&
                Object.hasOwn(args.adapter ?? {}, key) &&
                JSON.stringify(value) !== JSON.stringify(args.adapter![key])
            )
          )
            reasons.push(
              'Runtime overrides conflict with parameters observed in this page. Recapture current inputs; do not replace fresh challenge values.'
            );
          if (observation.conflict) reasons.push(observation.conflict);
          if (!observation.initialized && !args.adapter)
            reasons.push(
              'No initialized anchor was observed; inspect current runtime inputs before purchasing.'
            );
          if (!observation.websiteKey && !args.adapter?.websiteKey)
            reasons.push('Missing current widget sitekey.');
          if (
            !sameCaptchaUrl(String(adapter.websiteURL), args.url) ||
            (observation.websiteKey && adapter.websiteKey !== observation.websiteKey)
          )
            reasons.push('Runtime inputs do not match the observed page/widget.');
          if (unsupported.length)
            reasons.push(
              `Observed inputs cannot be represented by the current online contract: ${unsupported.join(', ')}. Do not omit them to pass validation.`
            );
          try {
            validateOnlineCaptchaAdapter(contract, adapter);
          } catch (error) {
            reasons.push(
              error instanceof Error ? error.message : 'Online contract validation failed.'
            );
          }
          if (!args.canApply)
            reasons.push(
              'Verify a permitted browser JavaScript application capability before purchasing. This tool cannot enable it.'
            );
          const ready = reasons.length === 0;
          candidates.push({
            ...base,
            ready,
            adapter,
            unsupportedObservations: unsupported,
            warnings,
            reason: reasons.join(' ') || undefined,
            onlineContract: contract,
            ...(ready
              ? {
                  purchase: {
                    tool: 'nex_captcha_buy',
                    arguments: {
                      productCode: product.productCode,
                      adapter,
                      workflow: 'BROWSER_RESULT'
                    }
                  }
                }
              : {})
          });
        } catch (error) {
          candidates.push({
            ...base,
            ready: false,
            reason: error instanceof Error ? error.message : 'Online contract unavailable.'
          });
        }
      }
      return successResult(
        'Detection is free and does not create a task. Select the actual widget; solver success and website acceptance require separate evidence.',
        {
          candidates,
          detected: observations.length > 0,
          ready: candidates.length === 1 && candidates[0]?.ready === true,
          purchaseAttempted: false,
          applicationVerifiedByServer: false,
          guidance:
            'HTML cannot prove all runtime parameters or browser permissions. Verify those in the original page/frame before buying; keep payments and reconciliation in NexCaptcha.'
        }
      );
    }
  }),
  defineTool({
    name: 'nex_captcha_apply_result',
    description:
      'Free: query an existing NexCaptcha local task id and, only on SUCCEEDED with a documented supported TOKEN result, return apply.javascript for the agent to execute in its already permitted original page/frame. Never creates or repurchases a task, executes code, changes permissions or clicks a final form submit. Requires the original url/sitekey binding from a purchase in this MCP process (at most five minutes); after restart query/reconcile the existing record instead of buying again. Optional selector must come from the current page. Repeat pending queries every 3–5 seconds. Application does not prove website acceptance.',
    inputSchema: z
      .object({
        id: serviceId,
        url: pageUrl,
        websiteKey: z.string().min(1),
        selector: z.string().min(1).max(1_000).optional()
      })
      .strict(),
    annotations: { readOnlyHint: false, idempotentHint: true },
    execute: async (args, ctx) => {
      const binding = captchaTaskBinding(ctx.sessions, args.id);
      if (
        !binding ||
        !sameCaptchaUrl(binding.url, args.url) ||
        binding.websiteKey !== args.websiteKey
      )
        return errorResult(
          'Original task/page binding is missing, expired or mismatched. Query/reconcile the existing local id; do not purchase again.',
          { code: 'CAPTCHA_BINDING_REQUIRED', purchaseAttempted: false }
        );
      if (
        !['RECAPTCHA_V2', 'RECAPTCHA_V2_ENTERPRISE', 'TURNSTILE', 'CLOUDFLARE_TURNSTILE'].includes(
          binding.productCode
        )
      )
        return errorResult(
          'This product needs its documented site integration; no generic application script is available. Do not repurchase.'
        );
      const { contract } = await readCaptchaContract(ctx, binding.productCode, binding.contextId);
      assertCaptchaReady(contract, true);
      if (contract.integration.resultKind !== 'TOKEN')
        return errorResult(
          'The online result contract is not TOKEN. No application script generated.'
        );
      const now = Date.now();
      if (binding.lastQueryAt && now - binding.lastQueryAt < 3_000)
        return successResult('Wait before querying the existing task again.', {
          id: args.id,
          state: 'POLL_LATER',
          retryAfterMs: 3_000 - (now - binding.lastQueryAt),
          purchaseAttempted: false
        });
      binding.lastQueryAt = now;
      const response = await ctx.api.request<any>(CAPTCHA_QUERY_ROUTE, {
        method: 'POST',
        headers: { 'X-Nex-Service-Context': binding.contextId },
        body: JSON.stringify({ id: args.id })
      });
      if (response.code !== 0)
        return apiErrorResult('CAPTCHA query failed; do not repurchase', response);
      if (
        response.contextId !== binding.contextId ||
        response.data?.id !== args.id ||
        response.data?.productCode !== binding.productCode
      )
        return errorResult(
          'Task identity/product context changed. No application script generated; reconcile the existing record.'
        );
      const record = response.data;
      if (record.state !== 'SUCCEEDED')
        return successResult(`Task state: ${record.state}. No new charge.`, {
          id: args.id,
          state: record.state,
          terminal: ['FAILED', 'EXPIRED'].includes(record.state),
          retryAfterMs: ['FAILED', 'EXPIRED'].includes(record.state) ? undefined : 3_000,
          guidance: ['FAILED', 'EXPIRED'].includes(record.state)
            ? 'Check Nex billing for the server-managed refund; no script is available.'
            : 'Query the same local id after 3–5 seconds.',
          purchaseAttempted: false
        });
      const solution = parseServiceJson(record.solution, {});
      try {
        if (
          !new AjvJsonSchemaValidator().getValidator(
            contract.integration.resultSchema as Record<string, unknown>
          )(solution).valid
        )
          return errorResult(
            'Solved CAPTCHA result does not match the current online result contract. No application script generated; do not repurchase.'
          );
      } catch {
        return errorResult(
          'The online CAPTCHA result schema cannot be validated. No application script generated; do not repurchase.'
        );
      }
      const token = solution.gRecaptchaResponse ?? solution.token;
      if (
        typeof token !== 'string' ||
        !token ||
        (solution.gRecaptchaResponse &&
          solution.token &&
          solution.gRecaptchaResponse !== solution.token)
      )
        return errorResult(
          'Successful task did not return one unambiguous supported token. Inspect the result contract; do not repurchase.'
        );
      return successResult(
        'Recognition succeeded. Execute the supplied expression only in the original page/frame with already permitted browser tools, then inspect website acceptance.',
        {
          id: args.id,
          state: record.state,
          websiteVerified: false,
          purchaseAttempted: false,
          apply: {
            javascript: buildCaptchaApplication(
              {
                url: binding.url,
                websiteKey: binding.websiteKey,
                productCode: binding.productCode,
                challenge: binding.challenge,
                selector: args.selector
              },
              token
            )
          }
        }
      );
    }
  })
];
