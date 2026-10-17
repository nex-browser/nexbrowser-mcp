import { z } from 'zod';

const requiredText = z.string().min(1);
const optionalText = z.string().optional();
const website = { websiteURL: requiredText.describe('Full target page URL.') };
const siteKey = {
  ...website,
  websiteKey: requiredText.describe('Public site key from the actual challenge.')
};
const browser = { userAgent: optionalText };
const proxy = {
  proxyType: optionalText,
  proxyAddress: optionalText,
  proxyPort: z.number().int().optional(),
  proxyLogin: optionalText,
  proxyPassword: optionalText
};
const requiredProxy = {
  ...proxy,
  proxyType: requiredText,
  proxyAddress: requiredText,
  proxyPort: z.number().int()
};
const recaptcha = {
  ...siteKey,
  pageAction: optionalText,
  apiDomain: optionalText,
  isEnterprise: z.boolean().optional(),
  minScore: z.number().optional(),
  ...browser
};
const imageText = {
  body: requiredText.describe('Base64 image from the actual challenge.'),
  phrase: z.boolean().optional(),
  caseSensitive: z.boolean().optional(),
  numeric: z.boolean().optional(),
  math: z.boolean().optional(),
  minLength: z.number().int().optional(),
  maxLength: z.number().int().optional(),
  comment: optionalText,
  imgInstructions: optionalText
};
const imageInstruction = { body: requiredText, comment: optionalText };

/** 每种公开产品显式定义原生 Zod 契约，公共字段复用，不能透传未声明的参数。 */
export const CAPTCHA_ADAPTER_SCHEMAS: Readonly<Record<string, z.ZodType>> = {
  NORMAL_CAPTCHA: z.strictObject({ ...imageText }),
  RECAPTCHA_V2: z.strictObject({ ...recaptcha, isInvisible: z.boolean().optional() }),
  RECAPTCHA_V3: z.strictObject({ ...recaptcha, minScore: z.number() }),
  RECAPTCHA_V2_ENTERPRISE: z.strictObject({ ...recaptcha, isInvisible: z.boolean().optional() }),
  RECAPTCHA_V3_ENTERPRISE: z.strictObject({ ...recaptcha, minScore: z.number() }),
  RECAPTCHA_ENTERPRISE: z.strictObject({ ...recaptcha, appId: optionalText }),
  CLOUDFLARE_TURNSTILE: z.strictObject({
    ...siteKey,
    action: optionalText,
    data: optionalText,
    pagedata: optionalText
  }),
  ARKOSE: z.strictObject({
    ...website,
    websitePublicKey: requiredText,
    funcaptchaApiJSSubdomain: optionalText,
    data: optionalText,
    ...browser
  }),
  GEETEST: z.strictObject({
    ...website,
    gt: requiredText,
    challenge: requiredText,
    apiServerSubdomain: optionalText,
    ...browser
  }),
  GEETEST_V4: z.strictObject({ ...website, captchaId: requiredText, ...browser }),
  CAPY_PUZZLE: z.strictObject({ ...siteKey, ...browser, ...proxy }),
  KEYCAPTCHA: z.strictObject({
    ...website,
    s_s_c_user_id: z.number().int(),
    s_s_c_session_id: requiredText,
    s_s_c_web_server_sign: requiredText,
    s_s_c_web_server_sign2: requiredText
  }),
  LEMIN: z.strictObject({
    ...website,
    captchaId: requiredText,
    divId: requiredText,
    leminApiServerSubdomain: optionalText
  }),
  AMAZON: z.strictObject({ ...siteKey, iv: optionalText, context: optionalText }),
  IMAGE_CAPTCHA: z.strictObject({ ...imageText }),
  TEXT: z.strictObject({ comment: requiredText }),
  AUDIO: z.strictObject({ body: requiredText, lang: optionalText }),
  ROTATE: z.strictObject({ ...imageInstruction }),
  GRID: z.strictObject({
    body: requiredText,
    comment: requiredText.describe('Original instructions for this grid challenge.')
  }),
  CLICK: z.strictObject({ ...imageInstruction }),
  COORDINATES: z.strictObject({ ...imageInstruction }),
  DRAW_AROUND: z.strictObject({ ...imageInstruction }),
  DRAG_AND_DROP: z.strictObject({
    comment: optionalText,
    background: requiredText,
    images: z.array(z.string()).min(1)
  }),
  BOUNDING_BOX: z.strictObject({ ...imageInstruction }),
  SLIDER_CAPTCHA: z.strictObject({ ...imageInstruction }),
  CYBERSIARA: z.strictObject({
    ...website,
    userAgent: requiredText,
    SlideMasterUrlId: requiredText
  }),
  MTCAPTCHA: z.strictObject({ ...siteKey }),
  DATADOME: z.strictObject({
    ...website,
    captchaUrl: requiredText,
    userAgent: requiredText,
    ...requiredProxy
  }),
  FRIENDLY_CAPTCHA: z.strictObject({
    ...siteKey,
    version: optionalText,
    moduleScript: optionalText,
    nomoduleScript: optionalText
  }),
  CUTCAPTCHA: z.strictObject({ ...siteKey, ...browser }),
  ATBCAPTCHA: z.strictObject({ ...siteKey, ...browser }),
  TENCENT: z.strictObject({
    ...website,
    appId: requiredText,
    captchaScript: optionalText,
    ...proxy
  }),
  PROSOPO: z.strictObject({ ...siteKey, ...browser }),
  CAPTCHAFOX: z.strictObject({ ...siteKey, ...browser }),
  VK_CAPTCHA: z.union([
    z.strictObject({ image: requiredText, steps: requiredText, ...browser, ...proxy }),
    z.strictObject({ redirectUri: requiredText, userAgent: requiredText, ...requiredProxy })
  ]),
  TEMU: z.strictObject({ image: requiredText, parts: z.array(z.string()).min(1) }),
  ALTCHA: z.union([
    z.strictObject({ ...website, challengeURL: requiredText, ...proxy }),
    z.strictObject({ ...website, challengeJSON: requiredText, ...proxy })
  ]),
  YIDUN_NE_CAPTCHA: z.strictObject({ ...siteKey, ...browser }),
  BINANCE: z.strictObject({ ...siteKey, ...browser }),
  HUNT: z.strictObject({ ...siteKey, ...browser }),
  TSPD: z.strictObject({
    ...website,
    ...browser,
    tspdCookie: requiredText,
    htmlPageBase64: requiredText,
    ...requiredProxy
  }),
  BASILISK: z.strictObject({ ...siteKey, ...browser }),
  IMPERVA: z.strictObject({ ...siteKey, ...browser }),
  ALIBABA: z.strictObject({
    ...website,
    sceneId: requiredText,
    prefix: requiredText,
    userId: optionalText,
    userUserId: optionalText,
    verifyType: optionalText,
    region: optionalText,
    userCertifyId: optionalText,
    apiGetLib: optionalText,
    ...browser
  }),
  YANDEX_SMARTCAPTCHA: z.strictObject({ ...siteKey, ...browser, cookies: optionalText, ...proxy }),
  RUSSIAN_CAPTCHA: z.strictObject({ ...imageText }),
  CHINESE_CAPTCHA: z.strictObject({ ...imageText }),
  NUMBER_CAPTCHA: z.strictObject({ ...imageText }),
  MATH_CAPTCHA: z.strictObject({ ...imageText }),
  CUSTOM: z.strictObject({ body: optionalText, comment: optionalText })
};
