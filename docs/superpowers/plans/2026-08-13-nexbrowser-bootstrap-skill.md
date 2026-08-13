# NexBrowser Bootstrap Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a separately installable `nexbrowser` Skill that guides an Agent through complete NexBrowser MCP setup.

**Architecture:** Keep setup orchestration in a concise bootstrap Skill and retain browser-operation guidance in `nexbrowser-automation`. The bootstrap registers the published MCP package directly with the target Agent CLI and installs the automation Skill through Skills CLI.

**Tech Stack:** Agent Skills Markdown, Vitest, Vercel Skills CLI, Node.js/TypeScript package tooling.

## Global Constraints

- The public Skill name is exactly `nexbrowser`.
- Never expose the NexBrowser OpenAPI key in chat or logs.
- Never replace an existing `nexbrowser` MCP configuration without explicit user approval to remove it.
- Do not duplicate the `nexbrowser-automation` tool catalog.

---

### Task 1: Add the bootstrap Skill contract test

**Files:**

- Modify: `test/skill-package.test.ts`
- Test: `test/skill-package.test.ts`

**Interfaces:**

- Consumes: repository `skills/` package layout.
- Produces: a failing contract requiring `skills/nexbrowser/SKILL.md` and valid local Markdown references.

- [ ] Add a test that reads `skills/nexbrowser/SKILL.md`, checks its Agent Skills frontmatter, and resolves every local Markdown reference.
- [ ] Run `pnpm exec vitest run test/skill-package.test.ts` and confirm failure because `skills/nexbrowser/SKILL.md` is missing.

### Task 2: Implement the bootstrap Skill

**Files:**

- Create: `skills/nexbrowser/SKILL.md`

**Interfaces:**

- Consumes: Codex `mcp add/get/remove` and Skills CLI `add/list` commands.
- Produces: the `nexbrowser` bootstrap Skill discovered by Skills CLI.

- [ ] Create concise frontmatter whose description triggers on NexBrowser installation, MCP registration, setup, configuration, and diagnostics.
- [ ] Define prerequisite, dry-run, installation, existing-config, verification, restart, and failure-recovery behavior.
- [ ] Run `pnpm exec vitest run test/skill-package.test.ts` and confirm it passes.

### Task 3: Document and verify distribution

**Files:**

- Modify: `README.md`
- Modify: `README.zh_CN.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: public GitHub repository and Skills CLI.
- Produces: the one-command public installation entry point.

- [ ] Document `npx skills add https://github.com/nex-browser/nexbrowser-mcp --skill nexbrowser` in both READMEs.
- [ ] Run local Skills CLI discovery and confirm it lists both public Skills.
- [ ] Run `pnpm run typecheck`, `pnpm test`, `pnpm run build`, `pnpm run test:dist`, and `pnpm run format:check`.
