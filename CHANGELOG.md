# Changelog

All notable changes to this project will be documented here.

The format is based on Keep a Changelog, and the project follows Semantic Versioning for the npm package and its public MCP tool contract.

## [Unreleased]

## [2026.10.23] - 2026-10-23

### Added

- Promote the NexIP, NexMail, NexSMS and NexCaptcha service tools and browser CAPTCHA workflows from the October prereleases to the stable channel, including online product contracts, supported Grid rounds, region screenshots and coordinate clicks.
- Add structured resource recovery for confirmed SMS, mailbox, proxy and CAPTCHA failures. Interactive tasks can replace unsuitable countries/products or mailbox formats/domains without another confirmation, respecting user constraints and at most 3 attempts per resource flow including the first.
- Add bounded SMS waiting up to 120 seconds and mailbox polling up to 180 seconds. The local `receivedAfter` filter accepts current messages already delivered before polling and excludes older messages; SMS with unverifiable receipt times is never filled when a sending-time filter is supplied.
- Add stable insufficient-balance flags that stop subsequent paid actions, and distinguish unknown purchase outcomes that require record and billing reconciliation before further spending.
- Bundle the updated automation Skill and installation guidance for the stable service workflows.
- `nex_proxy_detect` accepts `proxyIds` (up to 50) to check several saved proxies in one call and lists each result, missing IDs, and IDs left unchecked by the request time limit for a follow-up call. Requires a Desktop build whose local OpenAPI detects proxies on the client and writes results back like the proxy center.

### Changed

- **Breaking:** authorized service purchases, renewals, quota extraction and CAPTCHA submissions charge directly at the current server price. Remove quotation/payment-confirmation stages, `maxTotalPrice`, the CAPTCHA `confirmed` argument and the standalone proxy renewal quote tool. A price inquiry alone never places an order, and explicit user spending restrictions remain effective.
- Keep normal CAPTCHA Grid continuations on the original workflow and require a fresh challenge after a confirmed terminal failure. Unknown purchase outcomes retain their original identity and do not trigger duplicate charges.

### Fixed

- Carry structured billing and recovery states through text-only MCP hosts without losing the original service error code.
- Preserve browser action failure labels, declared management arguments and accurate window runtime/opening results from the prerelease fixes.
- Upgrade the MCP SDK to 1.32.0 to resolve the production dependency audit findings while retaining the Node.js 18 runtime floor.

## [2026.10.19-beta.4] - 2026-10-19

### Added

- Guide sign-ups that need an email address or phone number to check owned NexMail/NexSMS records first, then offer the user's own value or a quoted purchase in one question; a registration request alone never approves a purchase.
- Tell hosts to act on refs from the latest snapshot instead of guessed CSS selectors, with a screenshot and coordinate click as the fallback when a snapshot fails.

### Changed

- Group the server instructions by topic and replace the full CAPTCHA workflow repeated in eleven page tool descriptions with a short pointer to the free `nex_browser_captcha_prepare` route, reducing tool descriptions from about 33.9k to 20.8k characters.

### Fixed

- Report failed browser actions as `Browser action <name> failed` and failed session/tab calls with their own labels, instead of prefixing errors with success text such as `Screenshot captured.`.
- Send only declared fields from `nex_browser_create` to Desktop.
- Match `nex_browser_open` results by window ID and report a window without a returned row as failed instead of opened.
- Classify service tool transport failures (timeout or cancellation, missing configuration, invalid response, network error) with a structured code, without echoing raw exception text.

### Removed

- Unused per-file automation tool factories and the unread `docGroup` tool field.

## [2026.10.19-beta.3] - 2026-10-19

### Fixed

- Report Desktop runtime state in browser window listings, distinguishing locally running windows, windows occupied by another user and closed windows.
- Show an unknown status when older Desktop versions omit runtime state instead of inferring live processes from the raw server `opened` flag.

### Tests

- Cover runtime status summaries, legacy responses, pagination and query forwarding in browser window listings.

## [2026.10.19-beta.2] - 2026-10-19

### Added

- Support browser CAPTCHA Grid interaction with automatic visible reCAPTCHA grid detection or explicit selectors for supported image grids, including static and dynamic rounds.
- Return a free next-round preparation and quote when Grid images change; require separate fee and interaction approval before each new purchase.

### Changed

- Select browser CAPTCHA workflows from the current online contract and local adapter capabilities, and clarify when HTTP submission requires an established site integration.
- Require a documented 1-based row-major Grid result contract and preserve the original challenge image and instructions while keeping image data out of tool summaries.

### Fixed

- Prevent duplicate purchases for an in-flight Grid challenge and repeated tile clicks when checking completion progress.
- Treat unsupported adapters, missing parameters, uncaptured callbacks, HTTP 403 and timeouts as blockers instead of reasons to substitute Grid or raw CAPTCHA purchases.

### Tests

- Cover Grid preparation, per-round approval, result application, next-round quotes, duplicate-purchase prevention and workflow contract validation.

## [2026.10.19-beta.1] - 2026-10-19

### Changed

- Read complete NexCaptcha product contracts from the online schema endpoint instead of a bundled catalog. `nex_captcha_product_schema` now requires an exact `productCode` and a NexBrowser Desktop build providing `POST /captcha/schema`; offline catalog fallback is no longer available.
- Validate CAPTCHA purchases and browser completion against the current online input and result contracts, preserving the complete schema response for MCP clients.
- Default MCP browser tasks to opening and using NexBrowser environments, reusing the task environment when available.

### Fixed

- Surface the free NexCaptcha preparation workflow in server instructions, browser connection results and individual browser tool descriptions, including hosts that discover tools on demand.
- Direct page CAPTCHA handling through preparation, explicit fee and callback approval, submission and completion; prohibit local CDP/Python solving and unsupported raw-purchase fallbacks.

### Tests

- Add regression coverage for online contract validation, MCP routing, tool discovery and normal page inspection without automatic CAPTCHA purchases.

## [2026.10.17-beta.1] - 2026-10-17

### Added

- Add the read-only `nex_captcha_product_schema` tool with the official parameter and result contracts for 50 NexCaptcha products, including input sources, prerequisites and mutually exclusive modes.
- Add an offline catalog generator from the official NexCaptcha OpenAPI JSON.

### Changed

- Define each documented CAPTCHA adapter with native Zod schemas and validate fields, types and required inputs before submitting paid tasks; preserve pass-through compatibility for future product codes without forwarding platform authentication fields.
- Publish product-specific CAPTCHA adapter constraints in `tools/list` and host previews from the same native Zod definitions, preserving the flat purchase arguments and legacy product codes.
- Return only task metadata in ordinary CAPTCHA summaries, keeping raw challenges and credentials out of listings and purchase responses.

### Fixed

- Match legacy `TURNSTILE` and documented `CLOUDFLARE_TURNSTILE` products while preserving the exact live-quoted product code through purchase and result checks.
- Include a complete serialized JSON text copy alongside structured tool results for clients that read only `content`; preserve summary text, rich content and error flags. Results exceeding either output limit use the same omission object in both channels.

## [2026.10.16-beta.1] - 2026-10-16

### Added

- Add NexIP proxy purchases, renewals, short-term quotas and extraction with `nex_ip_*` tools.
- Add NexMail mailbox purchases and message reading with `nex_mail_*`, NexCaptcha tasks with `nex_captcha_*`, and billing reconciliation with `nex_billing_trade_list`.
- Add page CAPTCHA preparation, quotation, submission and result application for captured GeeTest v3/v4, explicit reCAPTCHA v2 and Turnstile widgets.
- Add cloud phone number purchases, SMS code retrieval and page filling, and number release with `nex_sms_*` tools.
- Add region screenshots and viewport coordinate clicks for browser automation.

### Changed

- Require explicit approval and live price ceilings for service purchases, and reconcile uncertain outcomes before repeating resource operations.
- Pin related service requests to the Desktop login/team context and forward MCP cancellation signals to API requests.
- Expand the bundled automation Skill, tool catalog and guides for service workflows, CAPTCHA handling and session cleanup.

### Fixed

- Upgrade the MCP SDK to 1.31.0 and refresh production dependencies to resolve the release audit findings.
- Validate OpenAPI response envelopes and distinguish record counts from page counts in service results.

## [2026.8.20] - 2026-08-20

### Added

- Add workspace catalog tools for platform accounts: `nex_account_list`, `nex_account_create`, `nex_account_batch_create`, `nex_account_modify`, and `nex_account_delete`. Secrets are never returned.
- Add custom proxy lifecycle tools: `nex_proxy_create`, `nex_proxy_batch_create`, `nex_proxy_modify`, `nex_proxy_delete`, and `nex_proxy_detect`. Credentials are never returned.
- Add `nex_browser_group_modify` to rename or reorder a custom window group. Group 0 remains read-only.
- Add `nex_browser_bind_account` to bind workspace catalog accounts to closed windows, or remove the binding with `accountIds=[]`.

### Changed

- Accept documented OpenAPI field aliases (`id`, `ids`, `items`, `windowIds`, `accountIds`, `proxyIds`) and make `nex_browser_connection_info` match `GET /browser/connection_info` (windowId optional).

## [2026.8.19] - 2026-08-19

### Added

- Add `nex_proxy_import` to create custom proxy resources from the same HTTP/HTTPS/SOCKS5 line formats as the NexBrowser Desktop proxy import box. Credentials are never returned.

### Changed

- **Breaking:** `nex_browser_fill_account` now asks the vault plugin to autofill the current login page. Callers pass only `accountId` (optional when the window has exactly one vault credential); `usernameTarget`, `passwordTarget`, and `totpTarget` are removed.
- `nex_browser_accounts` lists autofill-capable credentials from the open-window vault plugin, including bound platform accounts and user-saved passwords.
- Restrict `nex_browser_fill_credentials` to literal values the user supplied in the current request, and document recovery-email code retrieval.

## [2026.8.14] - 2026-08-14

### Added

- Add window group tools: list groups with their window counts, create a group, delete a custom group, and move windows into or out of a group.
- Add a `groupId` filter to `nex_browser_list` so windows can be listed per group, with `0` listing ungrouped windows.

### Changed

- **Breaking:** `nex_browser_list` now calls `GET /browser/list` instead of `POST /screen_load`. The last bare backend-command path was retired from NexBrowser OpenAPI, so this release requires a NexBrowser Desktop build that serves `/browser/list`.

## [2026.8.13-beta.1] - 2026-08-13

### Added

- Add explicit literal username, password, and retrieved 2FA-code filling with redacted MCP results and agent-driven guidance for arbitrary 2FA retrieval websites.

## [2026.8.13] - 2026-08-13

### Changed

- Streamline the English and Simplified Chinese documentation around setup, configuration, troubleshooting, and security.
- Keep `nexbrowser-automation` as the single bundled Skill and document its direct Skills CLI installation command.

### Added

- Verify packed-package installation with npm 12 secure defaults in CI.

## [2026.8.12-beta.1] - 2026-08-12

### Added

- Add proxy resource listing and proxy binding tools for managed NexBrowser windows.

### Changed

- Standardize NexBrowser OpenAPI authentication on `Authorization: Bearer <api-key>` and automation client identity on `X-Nex-Client-Id`.

## [1.0.9] - 2026-08-12

### Fixed

- Route automation session requests through the unified `/automation/*` NexBrowser OpenAPI endpoints.

### Changed

- Standardize NexBrowser OpenAPI terminology across runtime guidance, documentation, and the bundled automation skill.

## [1.0.8] - 2026-08-11

### Added

- Add `nex_browser_create` for creating one or more browser environments with optional account, proxy, plugin, preference, and fingerprint overrides.
- Add secure bound-account sign-in through `nex_browser_accounts` and `nex_browser_fill_account` without exposing stored passwords or 2FA secrets to MCP clients.
- Add local `.env` loading and checked-in MCP Inspector configuration and scripts for development.

### Changed

- Expand the bundled automation skill, examples, and documentation for environment creation and bound-account sign-in workflows.

## [1.0.7] - 2026-08-11

### Changed

- Clarify the multi-window workflow so callers batch-open all target environments once, then create and retain an explicit automation session for each window.

## [1.0.6] - 2026-08-11

### Changed

- Rename every public MCP tool into the single `nex_browser_*` namespace and remove all former tool names without compatibility aliases.
- Strengthen MCP and bundled Skill routing guidance with bilingual intent triggers so explicit NexBrowser OpenAPI requests are not redirected to generic browser, Chrome, computer-use, or operating-system window tools.

## [1.0.5] - 2026-08-10

## [1.0.4] - 2026-08-10

### Changed

- Replace the desktop-dialog purchase contract with exact typed-phrase confirmation and require callers to relay the user's confirmation text verbatim.

## [1.0.3] - 2026-08-08

### Added

- Add proxy IP product listing, price quotes, human-approved confirmation, and order-status MCP tools.
- Publish the corresponding purchase workflow and human-approval safeguards in the bundled skill and documentation.

## [1.0.2] - 2026-08-07

### Changed

- Clarify that `nex_browser_list` lists NexBrowser environments rather than operating-system application windows, and publish matching MCP routing guidance.
- Disable source-map generation in the published package.
- Make the MCP client configuration examples explicitly install the latest published package.

## [1.0.1] - 2026-08-06

### Changed

- Bundle TypeScript declarations into root-level ESM and CommonJS files so published packages no longer expose internal declaration directories.

## [1.0.0] - 2026-08-06

### Added

- Unified NexBrowser environment-management and browser-automation MCP server.
- ESM, CommonJS, CLI, and embedded-server entry points.
- Bundled NexBrowser automation skill and generated tool catalog.
- Cross-platform type, build, tool-surface, and protocol tests.

[Unreleased]: https://github.com/nex-browser/nexbrowser-mcp/compare/v2026.10.19-beta.4...HEAD
[2026.10.19-beta.4]: https://github.com/nex-browser/nexbrowser-mcp/compare/v2026.10.19-beta.3...v2026.10.19-beta.4
[2026.10.19-beta.3]: https://github.com/nex-browser/nexbrowser-mcp/compare/v2026.10.19-beta.2...v2026.10.19-beta.3
[2026.10.19-beta.2]: https://github.com/nex-browser/nexbrowser-mcp/compare/v2026.10.19-beta.1...v2026.10.19-beta.2
[2026.10.19-beta.1]: https://github.com/nex-browser/nexbrowser-mcp/compare/v2026.10.17-beta.1...v2026.10.19-beta.1
[2026.10.17-beta.1]: https://github.com/nex-browser/nexbrowser-mcp/compare/v2026.10.16-beta.1...v2026.10.17-beta.1
[2026.8.20]: https://github.com/nex-browser/nexbrowser-mcp/compare/v2026.8.19...v2026.8.20
[2026.8.19]: https://github.com/nex-browser/nexbrowser-mcp/compare/v2026.8.14...v2026.8.19
[2026.8.14]: https://github.com/nex-browser/nexbrowser-mcp/compare/v2026.8.13-beta.1...v2026.8.14
[2026.8.13-beta.1]: https://github.com/nex-browser/nexbrowser-mcp/compare/v2026.8.13...v2026.8.13-beta.1
[2026.8.13]: https://github.com/nex-browser/nexbrowser-mcp/compare/v2026.8.12-beta.1...v2026.8.13
[2026.8.12-beta.1]: https://github.com/nex-browser/nexbrowser-mcp/compare/v1.0.9...v2026.8.12-beta.1
[1.0.9]: https://github.com/nex-browser/nexbrowser-mcp/compare/v1.0.8...v1.0.9
[1.0.8]: https://github.com/nex-browser/nexbrowser-mcp/compare/v1.0.7...v1.0.8
[1.0.7]: https://github.com/nex-browser/nexbrowser-mcp/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/nex-browser/nexbrowser-mcp/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/nex-browser/nexbrowser-mcp/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/nex-browser/nexbrowser-mcp/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/nex-browser/nexbrowser-mcp/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/nex-browser/nexbrowser-mcp/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/nex-browser/nexbrowser-mcp/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/nex-browser/nexbrowser-mcp/releases/tag/v1.0.0
