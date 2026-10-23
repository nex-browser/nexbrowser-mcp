/** 外部宿主按需加载单个工具时，也能看到免费的验证码准备入口与解题边界。 */
export const PAGE_CAPTCHA_GUIDANCE =
  "For a page CAPTCHA (including GeeTest sliders and image grids), first call nex_browser_captcha_prepare (free) with the original sessionId/pageId. BROWSER_RESULT applies answers to captured GeeTest v3/v4, explicit reCAPTCHA v2 or Turnstile callbacks; BROWSER_INTERACTION requires a real supported image grid and uses GRID capture/native clicks. prepare checks the online integration.workflows and local adapter; select challengeId when multiple challenges exist. HTTP_SUBMIT is preferred only for a separately established site HTTP integration that preserves the required session and submits verification/business requests; nex_captcha_buy/query provide recognition only, not that site integration. There is no workflow switch parameter or automatic three-way router. HTTP 403, timeout, missing parameters or an uncaptured callback never justify switching to GRID or bypassing prepare with raw nex_captcha_buy. Report the concrete blocker. Do not use CDP, Python, image matching or scripted drags to solve CAPTCHAs. When needed for the user's task, use nex_browser_captcha_submit to charge directly without a quotation or payment confirmation, then nex_browser_captcha_complete with the same prepareId; verify website acceptance and business completion separately afterward. For GRID the workflow shares image/instructions, clicks returned tiles and CAPTCHA verify. complete captures changed images and returns a free nextPrepareId/nextPreparation; submit each prepared round directly when needed, never raw nex_captcha_buy.";

/**
 * Short pointer embedded in every page-entry tool description: hosts that load tools lazily
 * still learn the free preparation route and solving limits, while the full workflow lives in
 * the server instructions, the connect result and nex_browser_captcha_prepare.
 * 嵌入各页面入口工具描述的简短指引；完整流程只放在服务说明、连接结果与 prepare 工具中。
 */
export const PAGE_CAPTCHA_POINTER =
  'Page CAPTCHA: first call nex_browser_captcha_prepare (free, no purchase) with this sessionId/pageId, then submit and complete directly for the requested task without a quotation or payment confirmation. Do not use CDP, Python, image matching or scripted drags to solve CAPTCHAs, and never bypass prepare with raw nex_captcha_buy.';
