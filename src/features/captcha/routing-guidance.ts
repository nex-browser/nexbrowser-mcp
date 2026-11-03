/** 外部宿主按需加载工具时，也能看到自行操作浏览器的识别流程与付费边界。 */
export const PAGE_CAPTCHA_GUIDANCE = [
  '- Default page CAPTCHA workflow: inspect the original page/frame, select an enabled product from nex_captcha_product_list, then call nex_captcha_product_schema(productCode) for the live NexCaptcha contract. Use schema and integration.inputSources to collect actual challenge parameters with the existing permitted browser tools. Use the result contract and workflowGuide to confirm how the same tools will apply the answer before paying.',
  '- Call free nex_captcha_detect with the actual url, productCode, adapter and applicable workflow. HTML is optional for this path. Set canApply=true only after confirming a permitted application path; canApply defaults false and grants no permission. When ready, use the returned arguments with nex_captcha_buy, poll the local id with nex_captcha_query, then apply the documented result in the original page/frame using permitted browser tools. Use ordinary form filling or scaled image-coordinate clicks where appropriate.',
  '- For supported reCAPTCHA v2/enterprise and Turnstile token results, nex_captcha_apply_result(id, url, websiteKey, selector?) is free: it queries an existing task bought in this MCP process and returns apply.javascript for the agent to execute in the original page/frame. It does not execute code, change browser permissions or submit a final business form. After restart, query/reconcile the original task and use an explicit integration, never buy again to restore the binding.',
  '- The fixed Desktop bridge is optional: nex_browser_captcha_prepare (free), nex_browser_captcha_submit and nex_browser_captcha_complete support captured widgets and real supported Grid challenges. The default workflow needs no prepareId or initialization capture. A product with a documented, usable integration can follow the default workflow even when the HTML detector and token helper do not cover it.',
  '- Read the exact enabled product and current online schema. Enterprise s is optional: forward it when supported by the online schema; an undeclared s value may be omitted with a warning for Enterprise. Missing required inputs, other unsupported observed parameters, HTTP 403 or timeouts never justify dropping required data, ignoring the contract or switching to GRID. Keep all payments, records and reconciliation in nex_captcha_* and nex_billing_trade_list.',
  '- Do not bypass disabled evaluate/runCode permissions or switch to raw CDP to evade them. Never silently reload a filled form, guess challenge inputs or replace NexCaptcha recognition with local image matching.',
  '- A solved task is not website acceptance; verify the page afterward.'
].join('\n');

/**
 * Short pointer embedded in page-entry tool descriptions: hosts that load tools lazily
 * still learn the free detection route and browser permission boundary.
 * 嵌入各页面入口工具描述的简短指引；完整流程放在服务说明与连接结果中。
 */
export const PAGE_CAPTCHA_POINTER =
  'Page CAPTCHA: default to nex_captcha_product_schema, collect real page inputs with permitted tools, then use free nex_captcha_detect with productCode/adapter. Confirm application capability before NexCaptcha buy/query and apply the result in the original page. nex_browser_captcha_prepare is optional; never bypass browser permissions.';
