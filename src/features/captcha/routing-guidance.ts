/** 外部宿主按需加载单个工具时，也能看到免费的验证码准备入口与解题边界。 */
export const PAGE_CAPTCHA_GUIDANCE =
  'For a page CAPTCHA (including GeeTest sliders), first call nex_browser_captcha_prepare (free) with the original sessionId/pageId. Do not use CDP, Python, image matching or scripted drags to solve CAPTCHAs. Obtain explicit fee and site callback approval, then use nex_browser_captcha_submit and nex_browser_captcha_complete with the same prepareId; verify website acceptance afterward.';
