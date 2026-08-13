# Literal Credential Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a redacted MCP tool that fills caller-supplied usernames, passwords, and retrieved 2FA codes, plus guidance for agent-driven code retrieval from arbitrary websites.

**Architecture:** Add `nex_browser_fill_credentials` beside the existing interaction tools and reuse the current `/automation/sessions/:sessionId/actions` endpoint with the `fill` action. Validate target/value pairs locally, send fields sequentially, discard response payloads that could echo secrets, and return only field names and submission state. Keep arbitrary 2FA-site navigation as a documented agent workflow built from existing tab and interaction tools.

**Tech Stack:** TypeScript 5.9, Zod 4, Vitest 4, MCP SDK 1.30, pnpm 11.

## Global Constraints

- Literal credentials enter the MCP request and transport; never store, log, or echo them in tool results.
- Keep `nex_browser_fill_account` unchanged and recommend it when a bound account exists.
- Do not add a NexBrowser Desktop endpoint or a TOTP-generation dependency.
- Do not submit a login form from `nex_browser_fill_credentials`.
- Treat arbitrary 2FA retrieval pages as agent-driven browser workflows; stop on ambiguity, CAPTCHA, human confirmation, device approval, or SMS challenges.
- Use English for logs and `type(scope): short description` English commit messages.

---

### Task 1: Implement literal credential filling with redacted results

**Files:**

- Modify: `test/account-tools.test.ts`
- Modify: `src/features/browser-automation/interaction-tools.ts`

**Interfaces:**

- Consumes: `automationSchema`, `TARGET_PROPERTY`, `sessionId`, `actionsRoute`, `invalidArguments`, `errorResult`, and `successResult`.
- Produces: MCP tool `nex_browser_fill_credentials` with optional `usernameTarget`, `username`, `passwordTarget`, `password`, `totpTarget`, and `totpCode` inputs in addition to standard optional session fields.
- Produces: sanitized result shape `{ filled: string[], submitted: false }`.

- [ ] **Step 1: Add failing happy-path and redaction tests**

Append a `describe('nex_browser_fill_credentials', ...)` block to `test/account-tools.test.ts`. Create the tool with a request mock whose successful response deliberately echoes secrets in `msg` and `data`; execute it with three target/value pairs and `pageId`.

Assert the request calls, in order, are equivalent to:

```ts
expect(
  request.mock.calls.map(([path, options]) => [path, JSON.parse(String(options.body))])
).toEqual([
  [
    '/automation/sessions/session-1/actions',
    {
      action: 'fill',
      pageId: 'page-1',
      params: { target: 'e12', value: 'alice@example.com' }
    }
  ],
  [
    '/automation/sessions/session-1/actions',
    {
      action: 'fill',
      pageId: 'page-1',
      params: { target: 'e13', value: 'secret-password' }
    }
  ],
  [
    '/automation/sessions/session-1/actions',
    {
      action: 'fill',
      pageId: 'page-1',
      params: { target: 'e14', value: '123456' }
    }
  ]
]);

expect(result.structuredContent).toEqual({
  filled: ['username', 'password', '2FA code'],
  submitted: false
});
expect(JSON.stringify(result)).not.toMatch(/alice@example\.com|secret-password|123456/);
expect(String((result.content[0] as { text: string }).text)).toContain('was not submitted');
```

- [ ] **Step 2: Add failing validation and stop-on-error tests**

Cover all local validation branches without calling the API:

```ts
for (const arguments_ of [
  {},
  { username: 'alice' },
  { usernameTarget: 'e12' },
  { password: 'secret' },
  { passwordTarget: 'e13' },
  { totpCode: '123456' },
  { totpTarget: 'e14' }
]) {
  const result = await tool.execute(arguments_);
  expect(result.isError).toBe(true);
}
expect(request).not.toHaveBeenCalled();
```

Use a second request mock that succeeds for username and returns `{ code: 'ACTION_TIMEOUT', msg: 'secret-password', data: { value: 'secret-password' } }` for password. Assert there are exactly two calls, no 2FA call occurs, the result identifies `password`, and neither text nor structured content contains `secret-password`.

- [ ] **Step 3: Run the focused tests and confirm they fail**

Run:

```powershell
pnpm exec vitest run test/account-tools.test.ts
```

Expected: FAIL because `nex_browser_fill_credentials` is not registered.

- [ ] **Step 4: Implement the minimal tool**

In `src/features/browser-automation/interaction-tools.ts`:

1. Import `actionsRoute` with `accountFillRoute`.
2. Import `errorResult` with the existing result helpers.
3. Insert `nex_browser_fill_credentials` immediately after `nex_browser_fill_account` so related tools stay adjacent.
4. Define all literal values as `z.string().optional()` and all targets as `TARGET_PROPERTY.optional()`.
5. Determine presence with `value !== undefined` and `target !== undefined` so an explicitly supplied empty string remains a literal value.
6. Reject mismatched pairs before resolving the session or issuing a request.
7. Build complete fields in username, password, 2FA order.
8. POST each field to `actionsRoute(sessionId(args, ctx.sessions))` with this body:

```ts
JSON.stringify({
  action: 'fill',
  ...(args.pageId ? { pageId: String(args.pageId) } : {}),
  params: { target: field.target, value: field.value }
});
```

9. On a non-zero response, discard `msg` and `data` and return:

```ts
errorResult(`Failed to fill ${field.label}.`, {
  code: response.code,
  field: field.label
});
```

10. On success return:

```ts
successResult(`Filled ${filled.join(', ')}.\nThe form was not submitted.`, {
  filled,
  submitted: false
});
```

Use `2FA code` as the public label for the `totpCode` pair. Set no `readOnlyHint`; filling page fields changes browser state.

- [ ] **Step 5: Run focused tests and type checking**

Run:

```powershell
pnpm exec vitest run test/account-tools.test.ts
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the functional slice**

```powershell
git add -- src/features/browser-automation/interaction-tools.ts test/account-tools.test.ts
git commit -m "feat(mcp): add literal credential fill tool"
```

---

### Task 2: Publish safety metadata and arbitrary 2FA workflow guidance

**Files:**

- Modify: `test/tool-safety.test.ts`
- Modify: `test/skill-package.test.ts`
- Modify: `skills/nexbrowser-automation/SKILL.md`
- Create: `skills/nexbrowser-automation/examples/sign-in-with-literal-credentials.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: the `nex_browser_fill_credentials` tool from Task 1.
- Produces: LLM-visible safety rules that distinguish bound credentials from caller-supplied credentials.
- Produces: a reusable arbitrary-website 2FA retrieval workflow using existing tab and interaction tools.

- [ ] **Step 1: Add failing safety and documentation tests**

In `test/tool-safety.test.ts`, preserve the current assertion that `nex_browser_fill_account` accepts only account identifiers and targets. Add assertions that:

```ts
const literalProperties = Object.keys(
  (tool('nex_browser_fill_credentials').inputSchema as { properties?: object }).properties ?? {}
);
expect(literalProperties).toEqual([
  'sessionId',
  'pageId',
  'usernameTarget',
  'username',
  'passwordTarget',
  'password',
  'totpTarget',
  'totpCode'
]);
expect(tool('nex_browser_fill_credentials').description).toMatch(/never submits/i);
expect(tool('nex_browser_fill_credentials').description).toMatch(/MCP request/i);
expect(tool('nex_browser_fill_credentials').annotations?.readOnlyHint).not.toBe(true);
```

In `test/skill-package.test.ts`, assert that `SKILL.md` contains `nex_browser_fill_credentials`, links to `examples/sign-in-with-literal-credentials.md`, recommends `nex_browser_fill_account` when available, and says to stop when a retrieval code is ambiguous.

- [ ] **Step 2: Run the focused tests and confirm documentation expectations fail**

Run:

```powershell
pnpm exec vitest run test/tool-safety.test.ts test/skill-package.test.ts
```

Expected: the new tool metadata test passes after Task 1, while the new Skill-documentation assertions fail.

- [ ] **Step 3: Update the bundled Skill**

Edit `skills/nexbrowser-automation/SKILL.md` as follows:

- Expand the sign-in decision row to list both `nex_browser_fill_account` and `nex_browser_fill_credentials`.
- Keep bound accounts as the preferred safe path.
- Permit the literal tool only when the user explicitly supplies or asks to use literal credentials.
- Warn that values enter MCP/model context and must never be repeated in responses.
- State that `nex_browser_fill_credentials` fills only currently visible targets and never submits.
- Document temporary-tab retrieval from an arbitrary URL, agent-directed inspection and interaction, and the stop conditions from Global Constraints.
- Add a Progressive Disclosure link to the new example.
- Keep account creation, editing, and persistence in Desktop listed as out of scope; literal one-time filling is not account management.

Create `skills/nexbrowser-automation/examples/sign-in-with-literal-credentials.md` with this concrete workflow:

```text
1. nex_browser_connect(windowId="22448", startIfNeeded=true) -> SESSION
2. nex_browser_navigate(sessionId=SESSION, url=<login-url>)
3. nex_browser_snapshot(sessionId=SESSION)
4. nex_browser_fill_credentials(sessionId=SESSION, usernameTarget=<ref>, username=<username>)
5. nex_browser_click(sessionId=SESSION, target=<next-ref>)
6. nex_browser_wait_for(sessionId=SESSION, text=<password-step-text>)
7. nex_browser_snapshot(sessionId=SESSION)
8. nex_browser_fill_credentials(sessionId=SESSION, passwordTarget=<ref>, password=<password>)
9. nex_browser_click(sessionId=SESSION, target=<login-ref>)
10. If 2FA is requested, retain LOGIN_PAGE_ID and call nex_browser_tab_new(sessionId=SESSION, url=<retrieval-url>).
11. Inspect the retrieval page and interact only as required by its visible state.
12. If one code is unambiguous, retain it; otherwise stop and report the blocker.
13. nex_browser_tab_close(sessionId=SESSION, pageId=<retrieval-page-id>)
14. nex_browser_tab_select(sessionId=SESSION, pageId=LOGIN_PAGE_ID)
15. nex_browser_snapshot(sessionId=SESSION)
16. nex_browser_fill_credentials(sessionId=SESSION, totpTarget=<ref>, totpCode=<retrieved-code>)
17. nex_browser_click(sessionId=SESSION, target=<verify-ref>)
18. Verify the authenticated page with nex_browser_wait_for or nex_browser_snapshot.
```

The example must say not to put credential values into prose, logs, URLs, or tool results; the user-supplied retrieval URL is the only allowed URL exception.

- [ ] **Step 4: Add the changelog entry**

Under `## [Unreleased]` in `CHANGELOG.md`, add:

```markdown
### Added

- Add explicit literal username, password, and retrieved 2FA-code filling with redacted MCP results and agent-driven guidance for arbitrary 2FA retrieval websites.
```

- [ ] **Step 5: Run focused documentation tests**

Run:

```powershell
pnpm exec vitest run test/tool-safety.test.ts test/skill-package.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the safety and workflow documentation**

```powershell
git add -- CHANGELOG.md skills/nexbrowser-automation/SKILL.md skills/nexbrowser-automation/examples/sign-in-with-literal-credentials.md test/tool-safety.test.ts test/skill-package.test.ts
git commit -m "docs(skill): add literal credential login workflow"
```

---

### Task 3: Regenerate public catalogs and verify the package

**Files:**

- Modify: `test/tool-catalog.test.ts`
- Modify: `test/mcp-server.test.ts`
- Modify: `test/__snapshots__/tools-preview.json`
- Modify: `test/__snapshots__/tools-registered.json`
- Modify: `skills/nexbrowser-automation/references/tool-catalog.md`

**Interfaces:**

- Consumes: the registered tool surface and Skill changes from Tasks 1 and 2.
- Produces: a pinned 47-tool MCP catalog and generated Skill reference matching the live schemas.

- [ ] **Step 1: Update intentional tool-count assertions**

Change both `46` assertions in `test/tool-catalog.test.ts` to `47`. Change the unified tool-count assertion in `test/mcp-server.test.ts` from `46` to `47`, and include `nex_browser_fill_credentials` in the expected tool-name set.

- [ ] **Step 2: Regenerate the Skill tool catalog**

Run:

```powershell
pnpm run gen:catalog
```

Expected: `skills/nexbrowser-automation/references/tool-catalog.md` contains `nex_browser_fill_credentials` with all eight non-session and session schema properties represented according to the generator rules.

- [ ] **Step 3: Regenerate intentional MCP surface snapshots**

Run:

```powershell
pnpm exec vitest run test/tool-catalog.test.ts -u
```

Expected: both JSON snapshots gain exactly one tool entry with the approved name, description, schema, and no read-only annotation.

- [ ] **Step 4: Inspect generated diffs for secret leakage and unrelated drift**

Run:

```powershell
git diff --check
git diff -- test/__snapshots__/tools-preview.json test/__snapshots__/tools-registered.json skills/nexbrowser-automation/references/tool-catalog.md
```

Expected: changes are limited to the new tool, the intentional count updates, and generated ordering; no example credential value from tests appears in committed artifacts.

- [ ] **Step 5: Run complete verification**

Run:

```powershell
pnpm run format
pnpm run format:check
pnpm run typecheck
pnpm run test
pnpm run build
```

Expected: every command exits with code 0. Review `git diff` after formatting to ensure it did not alter unrelated user files.

- [ ] **Step 6: Commit generated contracts and verification updates**

```powershell
git add -- test/tool-catalog.test.ts test/mcp-server.test.ts test/__snapshots__/tools-preview.json test/__snapshots__/tools-registered.json skills/nexbrowser-automation/references/tool-catalog.md
git commit -m "test(mcp): update literal credential tool contracts"
```

- [ ] **Step 7: Confirm the final repository state**

Run:

```powershell
git status --short
git log -4 --oneline
```

Expected: the worktree is clean and the design, feature, documentation, and contract commits are present.
