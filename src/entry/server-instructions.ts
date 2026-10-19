import { PAGE_CAPTCHA_GUIDANCE } from '../features/captcha/routing-guidance.js';

/**
 * Server instructions sent once at MCP initialization, grouped by topic. Tool descriptions
 * repeat only the short pointers a lazily discovered tool needs; workflow detail lives here.
 * MCP 初始化时下发的服务说明，按主题分段；工具描述只保留按需发现所需的简短指引。
 */
const ROUTING = [
  'When using nexbrowser-mcp for browser tasks, use NexBrowser environments by default.',
  'Reuse the task environment when available; otherwise use nex_browser_list to find a suitable environment, then nex_browser_connect(windowId, startIfNeeded=true) to open and connect it.',
  'Continue with nex_browser_* using the matching sessionId/pageId, without asking whether to use NexBrowser again. Honor any environment explicitly selected by the user.',
  "IMPORTANT ROUTING RULE: NexBrowser is the product and this MCP server, not a generic browser. Whenever the user explicitly says NexBrowser/nexbrowser or asks to use NexBrowser OpenAPI, use this server's nex_browser_* tools; never substitute the Browser plugin, Chrome plugin, computer-use, shell commands, or process enumeration.",
  "NexBrowser windows are managed environments/profiles, not operating-system application windows or browser tabs. For requests to list or count them, call nex_browser_list first. Example: '使用 NexBrowser 查看我有多少窗口' means call nex_browser_list. Former tool names are not available."
].join(' ');

const PAGE_INTERACTION = [
  'Act on refs from the latest nex_browser_snapshot instead of guessed CSS selectors.',
  'If a snapshot fails, take a screenshot and use nex_browser_mouse_click_xy, or report the concrete error; do not retry invented selectors until they time out.'
].join(' ');

const CAPTCHA = [
  PAGE_CAPTCHA_GUIDANCE,
  'Discover and execute the CAPTCHA tools; merely reading their definitions is not preparation. Never download challenge images or install Pillow/OpenCV to solve them.',
  'If preparation reports an unsupported adapter, missing parameters or an uncaptured callback, report that concrete blocker; never bypass it with raw nex_captcha_buy or a local solver.',
  'Never silently reload a filled form, repurchase after timeout, or treat provider success as website acceptance.',
  'An explicit registration/login request authorizes its normal final submit unless the user restricted it; it does not authorize an unquoted CAPTCHA fee. Use one host approval request for the quoted fee and callback scope when available, without a duplicate text confirmation.'
].join(' ');

const REGISTRATION_RESOURCES = [
  'When a sign-up or verification step needs an email address or phone number the user has not supplied, first check owned resources with nex_mail_record_list or nex_sms_record_list and reuse a suitable unexpired one.',
  'Otherwise ask one question that offers both choices: the user’s own address or number, or a NexMail mailbox / NexSMS number quoted from nex_mail_plan_list or nex_sms_project_list with type, lifetime and total USDT.',
  'A registration request alone does not approve a purchase; buy only after the user accepts that quote.'
].join(' ');

const SERVICES = [
  'Cloud phone numbers for SMS verification codes use nex_sms_*, proxy marketplace capabilities use nex_ip_*, mailboxes use nex_mail_*, CAPTCHA tasks use nex_captcha_*, and payment/refund reconciliation uses nex_billing_*.',
  'All purchases and renewals, including nex_sms_buy and nex_mail_buy which charge the account balance, require explicit confirmation of scope and quoted total, with maxTotalPrice as a preflight ceiling rather than an atomic backend price lock. Quota extraction also requires approval.',
  'Never automatically repeat purchases, renewals, extraction or release after errors or timeouts; reconcile module records and billing first.',
  'Mail details mark messages read. Keep resource IDs and each module state machine distinct.'
].join(' ');

export const SERVER_INSTRUCTIONS = [
  ROUTING,
  PAGE_INTERACTION,
  CAPTCHA,
  REGISTRATION_RESOURCES,
  SERVICES
].join('\n\n');
