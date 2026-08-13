# Changelog

All notable changes to this project will be documented here.

The format is based on Keep a Changelog, and the project follows Semantic Versioning for the npm package and its public MCP tool contract.

## [Unreleased]

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

[Unreleased]: https://github.com/nex-browser/nexbrowser-mcp/compare/v2026.8.13...HEAD
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
