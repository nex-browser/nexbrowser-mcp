import { PAGE_CAPTCHA_GUIDANCE } from '../features/captcha/routing-guidance.js';

/**
 * Server instructions sent once at MCP initialization: the single source for cross-tool rules.
 * Tool descriptions keep only what a lazily discovered tool needs on its own.
 * MCP 初始化时下发的服务说明，是跨工具规则的唯一来源；工具描述只保留单独发现时必需的内容。
 */
const ROUTING = `## Routing
- IMPORTANT: NexBrowser is the product behind this MCP server, not a generic browser. When the user names NexBrowser/nexbrowser or its OpenAPI, use nex_* tools; never substitute the Browser plugin, Chrome plugin, computer-use, shell commands, or process enumeration.
- NexBrowser windows are managed environments/profiles, not operating-system windows or browser tabs. To list or count them, call nex_browser_list; '使用 NexBrowser 查看我有多少窗口' means call nex_browser_list.
- When using nexbrowser-mcp for browser tasks, use NexBrowser environments by default. Reuse the task environment, or pick one with nex_browser_list and call nex_browser_connect(windowId, startIfNeeded=true). Honor an environment the user selected, and keep using its sessionId/pageId without asking again.`;

const PAGE_INTERACTION = `## Page interaction
- Act on refs from the latest nex_browser_snapshot, not guessed CSS selectors.
- If a snapshot fails, take a screenshot and use nex_browser_mouse_click_xy, or report the error; do not retry invented selectors until they time out.`;

const CAPTCHA = `## Page CAPTCHA
${PAGE_CAPTCHA_GUIDANCE}
- Initial HTML detection and generated token application support reCAPTCHA v2/enterprise and Turnstile only. Other products require the online contract plus an explicit agent integration or a supported fixed Desktop adapter; no generic cookie or hCaptcha application is implied.
- An explicit sign-up/login request authorizes its final submit and the CAPTCHA solving it needs, unless the user restricted it.`;

const PAID_SERVICES = `## Paid services
- nex_sms_* phone numbers, nex_mail_* mailboxes, nex_ip_* proxy marketplace, nex_captcha_* CAPTCHA tasks, nex_billing_* charges and refunds.
- When the user's task needs a purchase, renewal, quota extraction or CAPTCHA submission, charge directly without a quotation or payment confirmation. A price, stock or plan inquiry alone never authorizes a purchase. Honor user spending limits and resource scope; never run purchases as tests.
- Sign-up resources: when a sign-up needs an email address or phone number the user did not supply, check nex_mail_record_list or nex_sms_record_list and reuse a suitable unexpired one. Otherwise obtain the needed NexMail mailbox or NexSMS number directly, choosing type, lifetime and quantity from the live catalog; do not ask for a separate price confirmation.
- Unknown outcome: a purchase error, timeout, missing allocation or unclear result may already have charged. Reconcile the module records and nex_billing_trade_list first; while unresolved, buy nothing more for that resource and report the blocker. Pending states and old records do not prove failure.
- Insufficient balance (-1208, billingBlocked or stopPaidOperations): stop all paid actions and report it.`;

const RECOVERY = `## Automatic recovery in interactive tasks
- Confirmed failure means: no SMS within 120 seconds, no matching email within 180 seconds (nex_mail_message_list waitSeconds=180), a confirmed proxy failure, CAPTCHA FAILED/EXPIRED, or the site rejecting the resource. Then replace only the failed task resource and continue without asking: reuse a suitable owned resource first, otherwise buy one.
- At most 3 attempts per resource flow including the first, or the user's lower limit. Changing country, project, domain or type does not reset the count; requested batch quantities are not retries.
- Phone numbers: track failed numbers and (countryId, projectId) pairs; choose another live-catalog project for the same target site and keep any country the user fixed. Release an eligible task-owned waiting number with nex_sms_release.
- Mailboxes: track rejected types, domains and suffixes, and choose another supported one.
- After replacing a number or mailbox, refill the form and send again. Pass that send's ISO timestamp with timezone as receivedAfter to nex_sms_code_get, nex_sms_code_fill or nex_mail_message_list, normally with onlyNew=false. Never reuse a previous resource's code.
- Proxies: save the task URL and form state, close only the task window, bind the replacement and reopen it. Never replace user-supplied or unrelated resources.
- Report each wait, failure, attempt count and replacement as progress, not as a question.
- Mail details mark messages read. Keep each module's resource IDs separate.`;

export const SERVER_INSTRUCTIONS = [
  ROUTING,
  PAGE_INTERACTION,
  CAPTCHA,
  PAID_SERVICES,
  RECOVERY
].join('\n\n');
