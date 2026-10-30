/** 外部宿主按需加载工具时，也能看到自行操作浏览器的识别流程与付费边界。 */
export const PAGE_CAPTCHA_GUIDANCE = [
  '- Prefer the agent-driven browser flow when its permitted tools can read the current page HTML and apply a result: nex_captcha_detect(url, html, canApply=true) is free; canApply defaults false and grants no permission. nex_captcha_buy with workflow=BROWSER_RESULT charges once under the current NexCaptcha contract, and nex_captcha_query polls the returned local id.',
  '- For supported reCAPTCHA v2/enterprise and Turnstile token results, nex_captcha_apply_result(id, url, websiteKey, selector?) is free: it queries an existing task bought in this MCP process and returns apply.javascript for the agent to execute in the original page/frame. It does not execute code, change browser permissions or submit a final business form. After restart, query/reconcile the original task and use an explicit integration, never buy again to restore the binding.',
  '- The fixed Desktop bridge is optional: nex_browser_captcha_prepare (free), nex_browser_captcha_submit and nex_browser_captcha_complete support captured widgets and real supported Grid challenges. Missing initialization capture alone does not block an agent integration that has actual inputs and a permitted application path.',
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
  'Page CAPTCHA: prefer free nex_captcha_detect with current HTML and already permitted browser tools; nex_browser_captcha_prepare is an optional fixed bridge. Check result application capability before paying; never bypass browser permissions.';
