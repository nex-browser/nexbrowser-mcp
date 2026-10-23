/** 外部宿主按需加载单个工具时，也能看到免费的验证码准备入口与解题边界。 */
export const PAGE_CAPTCHA_GUIDANCE = [
  '- Start with nex_browser_captcha_prepare (free) on the same sessionId/pageId, then nex_browser_captcha_submit (charges once) and nex_browser_captcha_complete with the same prepareId. Charge directly without a quotation or payment confirmation when the task needs it.',
  '- Supported: captured GeeTest v3/v4, explicit reCAPTCHA v2 and Turnstile callbacks, and real image grids (GRID). A Grid round that changes returns nextPrepareId from complete; submit it as the next step of the same challenge.',
  '- If prepare reports an unsupported widget, missing parameters, an uncaptured callback, HTTP 403 or a timeout, report that blocker. Never bypass prepare with raw nex_captcha_buy or switch to GRID; nex_captcha_buy only recognizes, and HTTP_SUBMIT needs a separate site integration.',
  '- Do not use CDP, Python, image matching, downloaded images or scripted drags to solve CAPTCHAs. Never silently reload a filled form.',
  '- A solved task is not website acceptance; verify the page afterward.'
].join('\n');

/**
 * Short pointer embedded in page-entry tool descriptions: hosts that load tools lazily
 * still learn the free preparation route and solving limits, while the full workflow lives in
 * the server instructions, the connect result and nex_browser_captcha_prepare.
 * 嵌入各页面入口工具描述的简短指引；完整流程只放在服务说明、连接结果与 prepare 工具中。
 */
export const PAGE_CAPTCHA_POINTER =
  'Page CAPTCHA: start with nex_browser_captcha_prepare (free). Do not solve CAPTCHAs with CDP, Python, image matching or scripted drags.';
