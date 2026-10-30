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

const pageUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  }, 'Use the actual HTTP(S) page URL without credentials.');

/** 仅映射可由线上字段明确表达的观察值；未支持的 s 等输入保留为阻塞。 */
function observedAdapter(
  observation: CaptchaObservation,
  url: string,
  properties: Record<string, unknown>
) {
  const adapter: Record<string, unknown> = { websiteURL: url, websiteKey: observation.websiteKey };
  const unsupported: string[] = [];
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
  return { adapter, unsupported };
}

export const AGENT_CAPTCHA_TOOL_SPECS: readonly McpToolSpec[] = [
  defineTool({
    name: 'nex_captcha_detect',
    description:
      'Free: inspect current HTML supplied by the agent and check enabled NexCaptcha products and their live contracts. Detects reCAPTCHA v2/enterprise and Turnstile without requiring Desktop initialization hooks. HTML is parsed locally, never executed or sent to the solver. Pass optional productCode/adapter only for actual runtime inputs observed in the same page/frame. Set canApply=true only after verifying an already permitted browser tool can read and apply JavaScript in that page. Missing inputs, unsupported s or a disabled application capability block purchase; never drop observed fields or guess parameters. Use the returned nex_captcha_buy arguments for payment through Nex, then query the local id and request nex_captcha_apply_result.',
    inputSchema: z
      .object({
        url: pageUrl,
        html: z.string().min(1).max(1_000_000),
        canApply: z.boolean().default(false),
        productCode: captchaProductCode.optional(),
        adapter: captchaAdapterInput.optional()
      })
      .strict(),
    annotations: { readOnlyHint: true, idempotentHint: true },
    execute: async (args, ctx) => {
      const catalog = await ctx.api.request<any[]>(CAPTCHA_PRODUCTS_ROUTE);
      if (catalog.code !== 0)
        return apiErrorResult('CAPTCHA product lookup failed; no purchase attempted', catalog);
      if (!catalog.contextId)
        return errorResult('Service identity/team context is unavailable. No purchase attempted.');
      const observations = inspectCaptchaHtml(args.html);
      if (!observations.length && args.productCode && args.adapter)
        observations.push({
          productCode: args.productCode,
          websiteKey:
            typeof args.adapter.websiteKey === 'string' ? args.adapter.websiteKey : undefined,
          initialized: true,
          fields: {}
        });
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
          const { adapter: observed, unsupported } = observedAdapter(
            observation,
            args.url,
            (contract.schema.properties ?? {}) as Record<string, unknown>
          );
          const adapter = { ...observed, ...args.adapter };
          const reasons: string[] = [];
          if (contract.integration.resultKind !== 'TOKEN')
            reasons.push(
              'The current result contract is not TOKEN; this HTML/application helper cannot complete it. Use a documented explicit integration without purchasing through this suggestion.'
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
