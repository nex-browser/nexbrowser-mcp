import { z } from 'zod';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import type { ToolContext } from '../../shared/define-tool.js';
import { CAPTCHA_SCHEMA_ROUTE } from '../../transport/routes.js';

const platformKeyPattern = '^(?:[aA][pP][iI]|[cC][lL][iI][eE][nN][tT])[-_]?[kK][eE][yY]$';
const platformKey = new RegExp(platformKeyPattern);

export const captchaProductCode = z.string().refine((code) => code.trim().length > 0, {
  message: 'productCode is required; use the exact code returned by nex_captcha_product_list.'
});
export const captchaAdapterInput = z
  .record(z.string(), z.unknown())
  .superRefine((adapter, context) => {
    if (Object.keys(adapter).some((key) => platformKey.test(key)))
      context.addIssue({
        code: 'custom',
        message:
          'Platform API keys must not be sent in adapter; authentication is managed by NexBrowser Desktop.'
      });
  })
  .meta({ propertyNames: { type: 'string', not: { pattern: platformKeyPattern } } });

export interface CaptchaContract extends Record<string, unknown> {
  productCode: string;
  schema: Record<string, unknown>;
  integration: Record<string, unknown>;
}

/** 只检查在线响应的公共信封，保留完整 Schema、指引及未来新增字段。 */
export function requireCaptchaContract(data: any, productCode: string): CaptchaContract {
  if (
    data?.productCode !== productCode ||
    !data.schema ||
    typeof data.schema !== 'object' ||
    Array.isArray(data.schema) ||
    !data.integration ||
    typeof data.integration !== 'object' ||
    Array.isArray(data.integration)
  )
    throw new Error(
      'Invalid online CAPTCHA contract; stop before purchasing. No offline fallback is available.'
    );
  return data;
}

/** 在线规则未就绪时禁止付费，不再维护本地产品禁用名单。 */
export function assertCaptchaReady(
  contract: CaptchaContract,
  browser: boolean | 'BROWSER_INTERACTION' = false
) {
  if (
    typeof contract.integration.readiness !== 'string' ||
    !contract.integration.readiness ||
    typeof contract.integration.resultKind !== 'string' ||
    !contract.integration.resultKind ||
    !contract.integration.resultSchema ||
    typeof contract.integration.resultSchema !== 'object'
  )
    throw new Error('The online CAPTCHA result contract is incomplete; stop before purchasing.');
  if (
    contract.integration.readiness === 'DOCUMENTATION_REQUIRED' ||
    contract.integration.resultKind === 'UNDOCUMENTED'
  )
    throw new Error(
      'DOCUMENTATION_REQUIRED: the online result contract is not ready; do not purchase.'
    );
  if (
    browser &&
    (!Array.isArray(contract.integration.workflows) ||
      !contract.integration.workflows.includes(browser === true ? 'BROWSER_RESULT' : browser))
  )
    throw new Error(
      `The online contract does not support ${browser === true ? 'BROWSER_RESULT' : browser}; do not purchase a page task.`
    );
}

/** 每次按线上完整 JSON Schema 校验，不裁剪 oneOf、额外字段或套用旧产品规则。 */
export function validateOnlineCaptchaAdapter(
  contract: CaptchaContract,
  adapter: Record<string, unknown>
) {
  captchaAdapterInput.parse(adapter);
  let valid = false;
  try {
    // 每次重新编译，避免相同 $id 的线上规则更新后命中旧校验器。
    valid = new AjvJsonSchemaValidator().getValidator(contract.schema)(adapter).valid;
  } catch {
    throw new Error('The online CAPTCHA schema cannot be validated; stop before purchasing.');
  }
  if (!valid)
    throw new Error(
      'CAPTCHA adapter does not match the current online contract. Read nex_captcha_product_schema; no parameter values are included in this error.'
    );
}

/** Schema 查询绑定同一次登录和团队快照；失败时不使用离线规则继续购买。 */
export async function readCaptchaContract(
  ctx: ToolContext,
  productCode: string,
  contextId?: string
) {
  let response;
  try {
    response = await ctx.api.request<any>(CAPTCHA_SCHEMA_ROUTE, {
      method: 'POST',
      ...(contextId ? { headers: { 'X-Nex-Service-Context': contextId } } : {}),
      body: JSON.stringify({ productCode })
    });
  } catch {
    throw new Error(
      'Online CAPTCHA schema unavailable. Check the connection and current login; no offline fallback.'
    );
  }
  if (response.code !== 0)
    throw new Error(`Online CAPTCHA schema request failed (${response.code}): ${response.msg}`);
  if (!response.contextId || (contextId && response.contextId !== contextId))
    throw new Error(
      'Service identity/team context changed or is unavailable; stop before purchasing.'
    );
  return {
    contract: requireCaptchaContract(response.data, productCode),
    contextId: response.contextId
  };
}
