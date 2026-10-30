import { z } from 'zod';
import {
  assertCaptchaReady,
  validateOnlineCaptchaAdapter,
  type CaptchaContract
} from './online-schema.js';
import { sameCaptchaUrl } from './agent-captcha-state.js';

export const captchaWorkflow = z.enum(['HTTP_SUBMIT', 'BROWSER_RESULT', 'BROWSER_INTERACTION']);

/** 按在线契约规划通用接入；无固定桥接不代表产品不可用，也不授予浏览器权限。 */
export function planAgentCaptcha(
  contract: CaptchaContract,
  input: {
    url: string;
    adapter?: Record<string, unknown>;
    workflow?: z.infer<typeof captchaWorkflow>;
    canApply?: boolean;
  }
) {
  const workflows = Array.isArray(contract.integration.workflows)
    ? contract.integration.workflows
    : [];
  const workflow =
    input.workflow ??
    (workflows.includes('BROWSER_RESULT') ? 'BROWSER_RESULT' : 'BROWSER_INTERACTION');
  const reasons: string[] = [];
  try {
    assertCaptchaReady(contract);
    if (!workflows.includes(workflow))
      reasons.push(`The online contract does not support ${workflow}.`);
    if (input.adapter === undefined)
      reasons.push('Collect actual challenge inputs using the online schema and inputSources.');
    else {
      validateOnlineCaptchaAdapter(contract, input.adapter);
      if (
        input.adapter.websiteURL !== undefined &&
        !sameCaptchaUrl(String(input.adapter.websiteURL), input.url)
      )
        reasons.push('The challenge websiteURL does not match the current page.');
    }
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : 'Online contract validation failed.');
  }
  if (!input.canApply)
    reasons.push(
      'Confirm permitted tools can apply this result in the original challenge before purchasing. canApply grants no permission; JavaScript is not required for ordinary fill/click actions.'
    );
  const ready = reasons.length === 0;
  return {
    route: 'AGENT' as const,
    productCode: contract.productCode,
    ready,
    workflow,
    reason: reasons.join(' ') || undefined,
    onlineContract: contract,
    purchaseAttempted: false,
    applicationVerifiedByServer: false,
    application: {
      resultKind: contract.integration.resultKind,
      resultSchema: contract.integration.resultSchema,
      resultGuide: contract.integration.resultGuide,
      requirements: contract.integration.requirements,
      guidance:
        'Use the online result contract with permitted browser tools: text/transcripts may use fill_form; image coordinates may use mouse_click_xy in returned order after converting image origin/scale. Other results require their documented page integration. Recheck the original page/frame, session and unchanged challenge before application; validate the solution against resultSchema and inspect website acceptance. A missing fixed bridge is not a product restriction. Never invent a token callback, cookie scope or interaction format.'
    },
    ...(ready
      ? {
          purchase: {
            tool: 'nex_captcha_buy',
            arguments: { productCode: contract.productCode, adapter: input.adapter!, workflow }
          },
          next: [
            'nex_captcha_query',
            'apply the documented result with permitted tools',
            'verify website acceptance'
          ]
        }
      : {})
  };
}

/** 固定桥接未捕获挑战时继续引导采集真实参数；不创建付费任务。 */
export const AGENT_CAPTCHA_HANDOFF = {
  route: 'AGENT',
  purchaseAttempted: false,
  guidance:
    'No ready fixed bridge is available. This does not mean the CAPTCHA product is unsupported. Inspect the current page using snapshot, text or a challenge-only screenshot; choose the exact enabled product and read nex_captcha_product_schema. Then call nex_captcha_detect with the actual url, productCode, adapter, workflow and canApply=true only after verifying a permitted result-application path. HTML is optional for this explicit integration. Never guess missing inputs, reload a filled form or bypass disabled permissions.'
} as const;
