/** 外部宿主按需加载工具时，也能看到自行操作浏览器的识别流程与付费边界。 */
export const PAGE_CAPTCHA_GUIDANCE = [
  '- Prefer agent-driven integration using the live product schema and permitted tools. nex_captcha_detect accepts current HTML for token detection or explicit url/productCode/adapter for any documented product; canApply defaults false and grants no permission. nex_captcha_buy charges once under the current NexCaptcha contract and selected workflow, and nex_captcha_query polls the returned local id.',
  '- For supported reCAPTCHA v2/enterprise and Turnstile token results, nex_captcha_apply_result(id, url, websiteKey, selector?) is free: it queries an existing task bought in this MCP process and returns apply.javascript for the agent to execute in the original page/frame. It does not execute code, change browser permissions or submit a final business form. After restart, query/reconcile the original task and use an explicit integration, never buy again to restore the binding.',
  '- The fixed Desktop bridge is optional: nex_browser_captcha_prepare (free), nex_browser_captcha_submit and nex_browser_captcha_complete support captured widgets and real supported Grid challenges. Missing initialization capture alone does not block an agent integration that has actual inputs and a permitted application path.',
  '- Product integration follows the live catalog/schema, not the fixed bridge product set. For TEXT, CLICK or any other enabled documented product, call nex_captcha_detect with actual url, productCode and adapter (HTML optional), choose its online workflow and confirm permitted application tools before setting canApply=true. Use buy/query, then apply the documented result with fill_form, scaled image-coordinate clicks or the required site integration. No product-specific branch or JavaScript permission is needed for ordinary fill/click actions. Missing fixed capture returns agentIntegration, not a product rejection.',
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
  'Page CAPTCHA: use free nex_captcha_detect with current HTML or explicit productCode/adapter for any documented enabled product; nex_browser_captcha_prepare is an optional fixed bridge. Check permitted result application capability before paying; never bypass browser permissions.';
