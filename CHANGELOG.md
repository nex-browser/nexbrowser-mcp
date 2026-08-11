# Changelog

All notable changes to this project will be documented here.

The format is based on Keep a Changelog, and the project follows Semantic Versioning for the npm package and its public MCP tool contract.

## [Unreleased]

## [1.0.6] - 2026-08-11

### Changed

- Rename every public MCP tool into the single `nex_browser_*` namespace and remove all former tool names without compatibility aliases.
- Strengthen MCP and bundled Skill routing guidance with bilingual intent triggers so explicit NexBrowser and LocalAPI requests are not redirected to generic browser, Chrome, computer-use, or operating-system window tools.

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

[Unreleased]: https://github.com/nex-browser/nexbrowser-mcp/compare/v1.0.6...HEAD
[1.0.6]: https://github.com/nex-browser/nexbrowser-mcp/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/nex-browser/nexbrowser-mcp/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/nex-browser/nexbrowser-mcp/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/nex-browser/nexbrowser-mcp/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/nex-browser/nexbrowser-mcp/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/nex-browser/nexbrowser-mcp/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/nex-browser/nexbrowser-mcp/releases/tag/v1.0.0
