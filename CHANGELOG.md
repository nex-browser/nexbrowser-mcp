# Changelog

All notable changes to this project will be documented here.

The format is based on Keep a Changelog, and the project follows Semantic Versioning for the npm package and its public MCP tool contract.

## [Unreleased]

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

[Unreleased]: https://github.com/nex-browser/nexbrowser-mcp/compare/v2026.8.19...HEAD
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
