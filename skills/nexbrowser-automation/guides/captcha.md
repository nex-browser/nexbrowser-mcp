# NexCaptcha tasks and page workflow

## Choose the integration workflow

These are three integration workflows, not three products or a caller-supplied `workflow` parameter. First identify the actual challenge and read the selected product's online `integration.workflows`, result contract and `workflowGuide`. Product availability, a documented workflow and local execution support are separate requirements.

| Workflow              | Choose only when                                                                                                                                                                                                                                                    | Current MCP boundary                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HTTP_SUBMIT`         | The online contract permits it and an established site integration can obtain actual challenge inputs, preserve the required session and submit both verification and business requests over HTTP. Prefer this route when those conditions are already established. | `nex_captcha_product_list` → `nex_captcha_product_schema` → approved `nex_captcha_buy` → `nex_captcha_query` supplies recognition. Target-site HTTP submission, session handling and acceptance checks need a separate site integration; this is not a generic website HTTP runner.                     |
| `BROWSER_RESULT`      | The target browser integration accepts the result and the local bridge captures the actual widget parameters and success callback.                                                                                                                                  | `nex_browser_captcha_prepare` → approved `submit` → `complete` supports captured GeeTest v3/v4, explicit reCAPTCHA v2 and Turnstile. Online support for another product does not add its browser adapter. Apply answers/tokens/field groups using the original widget; do not replace challenge images. |
| `BROWSER_INTERACTION` | A real image-grid challenge matches the online GRID contract and Desktop can capture its original image/instructions and execute its required clicks.                                                                                                               | The same browser tools use GRID capture/native clicks, with visible reCAPTCHA grid detection or observed selectors for other regular grids. Arbitrary rotation, dragging, canvas and irregular puzzles are not implemented by this bridge. Both MCP and Desktop need the Grid implementation.           |

For an existing browser flow, actually call free `nex_browser_captcha_prepare` first. It checks `BROWSER_RESULT` for supported result widgets or `BROWSER_INTERACTION` for GRID; it is not an automatic three-way router and does not build an HTTP integration. With multiple candidates, explicitly select the intended `challengeId` from current page evidence. Do not guess between a token widget and a visible Grid.

HTTP 403, timeouts, invalid/missing parameters, an uncaptured callback or a missing browser capability do not justify switching to GRID, raw purchases or another workflow. Report the concrete blocker: unavailable product/contract, missing inputs, unsupported adapter/interaction, uncaptured callback, expired challenge, or rejected site verification. Select Grid only from a real supported current image challenge. Never spend to discover missing parameters or use examples as real inputs.

Check three outcomes separately: recognition succeeded (`SUCCEEDED`), the target accepted verification, and the intended business operation completed. `applied=true` only describes local result application; it does not prove the last two outcomes. Grid `websiteVerified=true` requires an explicit configured acceptance signal and still does not establish business completion.

## Standalone product parameters

Product rules come exclusively from the online `POST /nex_captcha_schema` endpoint through the signed-in Desktop client. `nex_captcha_product_schema(productCode=selectedCode)` is free and read-only, requires a connection, and returns the complete `productCode`, `schema`, `example`, `integration`, `workflowGuide` and any future fields. There is no bundled product catalog, fixed product count, lookup alias, or offline fallback. The server caches schemas for one hour by product and language; prices have a separate ten-minute cache.

The purchase tool retains the flat `productCode`, `adapter`, and `maxTotalPrice` arguments. Its public tool schema checks only common input shape and platform-key protection. Before buying, it reads and validates against the current online product schema, including `oneOf`, types and `additionalProperties`. The complete online result is also available as JSON text for hosts that consume only `content`.

1. Read `nex_captcha_product_list` for enabled products and payable single-task USDT prices. Keep the exact product code, including case; do not rewrite or trim it.
2. Call `nex_captcha_product_schema(productCode=selectedCode)`. Read the complete schema, `integration.resultSchema/resultGuide` and `workflowGuide`. Examples contain placeholders; replace them with actual authorized challenge inputs. Do not invent values, borrow another product's fields or submit platform API keys.
3. Stop before purchasing if the online schema cannot be read or validated, the result contract is incomplete, or readiness is `DOCUMENTATION_REQUIRED`. Never substitute old documentation or start a paid task to discover missing rules. Product-specific validation follows the online schema and the backend/upstream, with no local product definitions.
4. Quote the product, task scope, intended result use and current fee. Obtain explicit approval through the host approval panel when available. Call `nex_captcha_buy(productCode, adapter, maxTotalPrice=approvedFee)` once. Desktop manages authentication and balance; do not request a NexCaptcha API key. The price ceiling is a live preflight check, not an atomic lock.
5. Retain the local `id` and query `nex_captcha_query(id=localId)`, never upstream `taskId`. Poll only as needed at 3–5 second intervals. Stop on SUCCEEDED, FAILED or EXPIRED; CREATED, SUBMITTING and PROCESSING are pending. Interpret the solution using the online product contract. Unknown purchases, timeouts and restarts require reconciliation through `nex_captcha_record_list` and `nex_billing_trade_list`; never repurchase automatically. FAILED/EXPIRED refunds are server-managed; verify billing.

Online product availability does not imply automatic browser capture or completion. Page challenges must use the browser workflow below; never bypass an unsupported page adapter or callback through a raw purchase.

## Browser page workflow

When a CAPTCHA blocks a user-authorized browser flow, check NexCaptcha first. Keep the original sessionId and pageId explicit throughout. A generic instruction to register or sign in does not approve an unquoted solving fee.

When using nexbrowser-mcp for browser tasks, open and use a NexBrowser environment by default. Reuse the task environment, or find one with `nex_browser_list` and open/connect it with `nex_browser_connect(windowId, startIfNeeded=true)`. Actually call free `nex_browser_captcha_prepare`; reading its tool definition alone does not prepare a challenge. Do not switch to CDP, Python, Pillow/OpenCV, downloaded images, local gap matching or scripted dragging to solve a CAPTCHA. This restriction concerns real CAPTCHA solving, not ordinary page inspection or code development. Unsupported preparation must produce a concrete blocker, never a local solver or raw `nex_captcha_buy` fallback.

An explicit registration/login request authorizes its normal final submit unless the user has restricted it. Obtain approval once for the quoted CAPTCHA fee and callback scope through the host panel when available, without another equivalent text-confirmation round. Re-preparation returns a new prepareId and quote that require their own matching approval; do not reuse old approval state.

1. Call `nex_browser_captcha_prepare(sessionId, pageId)`. It reads enabled products and current payable USDT prices before inspecting the page, then checks the selected online contract and BROWSER_RESULT support (BROWSER_INTERACTION for GRID). Preparation is free. The result either supplies a short-lived prepareId/quote or explains the missing product, parameters or callback. With multiple widgets, explicitly choose a returned challengeId. Never guess between widgets.
2. Prefer preparing before navigation; NexBrowser navigation/reload also installs the bridge before page scripts initialize. The bridge captures GeeTest v3/v4, explicit reCAPTCHA v2 render and Turnstile render. A widget initialized before capture may need reinitialization. Explain that blocker and ask before reloading a filled form; do not silently lose email/password inputs. Implicit rendering, unsupported integrations and product types outside these adapters may require site-specific work or manual completion.
3. For GeeTest v3, do not submit the challenge already loaded into the widget. Identify the same-origin GET request that fetched the original `gt` and `challenge` using `nex_browser_network_requests` (and its recorded response). Pass its exact observed URL as challengeUrl in prepare. Submit fetches a fresh matching challenge only after fee approval. Endpoints that require POST, additional headers, JSONP or a different response shape need a site-specific adapter; never guess or replay arbitrary requests.
4. Quote the returned product, actual single-task fee, public parameters to be submitted, and site callback scope. Obtain explicit confirmation, including in full-access mode; use the host's approval panel when available without requiring an extra text-confirmation round. A quotation-only request must stop before submission. A price change requires a new quote and approval. The backend ceiling is a preflight check, not an atomic price lock.
5. Call `nex_browser_captcha_submit(prepareId, confirmed=true, maxTotalPrice=approvedFee)`. It rechecks price, user/team context and page challenge, submits once, and retains the local task ID. Never substitute the upstream taskId. A failed/unknown response may follow a debit; keep the prepareId and reconcile `nex_captcha_record_list` and `nex_billing_trade_list`. Never create another task automatically. State is local to this MCP process: after a restart, reconcile before any new purchase.
6. Call `nex_browser_captcha_complete(prepareId)` to query once and dispatch a successful answer to the captured widget. Pending results return a retry interval; wait 3–5 seconds before another call and stop when no longer needed. It never starts background polling or purchases. FAILED/EXPIRED stop the flow; inspect billing to verify the refund. Unknown states/network errors do not prove failure or a refund.
7. Read a fresh page snapshot and, when needed, the site's verification response. `applied=true` means the original callback received the answer; `websiteVerified=false` deliberately makes no acceptance claim. The callback may itself send verification requests or submit a site form: obtain authorization for those effects before complete, including any required login/signup confirmation. These tools do not click a final login/signup button. A callback that throws may already have sent the request: inspect the site, never dispatch it again automatically.

Navigation, resets, expiry, frame changes and locally observed account/team changes block reuse of old tasks. Solutions stay between the service and original page, outside workflow results. A CAPTCHA success does not authorize device approval, ambiguous recovery codes or unsupported SMS challenges.

Hand over only after reporting a concrete blocker: unavailable product, missing/expired parameters, uncaptured callback, declined fee or a rejected site verification. Do not use the old unconditional “CAPTCHA means stop” instruction.

Product parameter and result contracts follow the [official NexCaptcha documentation](https://app.nexcaptcha.net/openapi/docs.cgi?lang=zh-CN). Browser integration details also reference the [GeeTest v3 browser API](https://docs.geetest.com/captcha/apirefer/api/web).

## Grid browser interaction

Update both the MCP package and Desktop client: the image capture and native clicks run in Desktop's fixed CAPTCHA actions, without arbitrary evaluation permissions. `prepare` detects visible reCAPTCHA image grids even when their token callback was not captured. If multiple token widgets or grids are returned, select the actual Grid `challengeId` explicitly. This is not an automatic fallback from a failed token task.

For another regular image grid, pass observed DOM selectors in `grid` to `nex_browser_captcha_prepare`:

```json
{
  "sessionId": "CURRENT_SESSION",
  "pageId": "CURRENT_PAGE",
  "grid": {
    "root": "#challenge-grid",
    "tiles": ".tile",
    "instruction": "#challenge-instructions",
    "verify": "#challenge-verify",
    "success": "#challenge-accepted",
    "mode": "dynamic"
  }
}
```

`root` must contain only the visible rectangular image grid. `tiles` is relative to that root; the other selectors are scoped to its frame. Instructions and CAPTCHA verification control must each match one visible element. `success` is optional and must identify a visible, explicit acceptance signal, never a generic page container or a business submit control. Regular grids need at least two rows and two columns, at most 100 tiles, at most 1000px per side and a JPEG under 600kB. Images must be loaded, have a regular spatial layout and fit inside an iframe's viewport. `<img>` and CSS background images are supported; canvas, irregular puzzles and unsupported widget behavior need a site adapter. The adapter infers rows/columns locally and sends only `body` and the unchanged `comment` to the current online GRID schema. It does not send unsupported 2Captcha options such as `imgType`, `rows`, `columns` or `previousId`.

- `static`: click the returned tiles, then the CAPTCHA verification control.
- `dynamic`: click returned tiles and wait for replacements. If replacement is delayed, call `complete` again to inspect without repeating clicks. A later empty `solution.click` means there are no matching tiles and triggers CAPTCHA verify.
- `auto` (default): wait up to three seconds for replacements before deciding whether to verify. Use `dynamic` explicitly for widgets with slower replacement and `static` for fixed selection challenges.

Approve the quoted single-round fee, sharing this image/instructions, tile clicks and CAPTCHA verify before `submit`. `complete` validates unique 1-based, row-major indexes, binds the answer to the original document/frame/image and checks the remaining targets before each native click. It never clicks a final login/signup button. The image payload and answer stay outside public MCP workflow results.

`complete` returns `gridState`: `WAITING_IMAGES` requires another progress call; `NEXT_ROUND` includes `nextPrepareId` and `nextQuote` when the current image is ready. These are free quotes: obtain a new approval and call `submit` with that new prepareId, then `complete`. No new paid task is created by `complete`. `VERIFY_REQUIRED` means inspect the site's verification response; disappearance or an unchanged rejected grid is not proof of acceptance and is not automatically repurchased. `ACCEPTED`/`websiteVerified=true` requires the configured explicit success signal. Without one, verify acceptance from the site separately.

An unknown purchase or partial/unknown click outcome stops replay and repurchase; reconcile tasks/billing and inspect the page. Do not bypass a blocked adapter with raw purchases or local image solving.
