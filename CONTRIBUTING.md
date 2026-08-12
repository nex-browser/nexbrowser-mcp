# Contributing

Thank you for helping improve NexBrowser MCP.

## Before You Start

- Use the Node.js 24.19.0 version pinned in `.nvmrc`; Node.js 22.13 or later also works with the pinned pnpm 11 toolchain. The published runtime supports Node.js 18 or later; Node.js 20 or later is recommended for consumers.
- Use the pnpm version declared in `package.json`.
- Open an issue before making a breaking tool-schema or behavior change.
- Never include OpenAPI tokens, browser data, CDP endpoints, cookies, or private page content in issues, fixtures, snapshots, or logs.

## Development

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:package
```

Tool names, descriptions, schemas, annotations, and order are an LLM-visible public contract. If a deliberate change affects the golden files, update them with:

```bash
pnpm exec vitest run test/tool-catalog.test.ts -u
pnpm gen:catalog
```

Review the resulting diff instead of accepting snapshot changes blindly.

## Pull Requests

- Keep changes focused and explain user-visible behavior changes.
- Add tests for fixes and new behavior.
- Update both English and Chinese README content when public usage changes.
- Call out breaking MCP surface changes and migration steps explicitly.
- Confirm `pnpm test:package` passes before requesting review.

By contributing, you agree that your contribution is licensed under the repository's MIT License.
