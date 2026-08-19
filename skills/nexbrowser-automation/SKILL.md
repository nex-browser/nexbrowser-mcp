---
name: nexbrowser-automation
description: Use whenever the user explicitly names NexBrowser/nexbrowser or asks to use NexBrowser OpenAPI, including listing or counting managed windows/environments/profiles (查看有多少窗口、查询环境), connecting to a managed window, navigation, clicking, typing, uploading, scraping, screenshots, tabs, or NexBrowser automation debugging. Route these requests to NexBrowser MCP tools, never generic Browser, Chrome, or computer-use tools.
---

# NexBrowser Automation Skill

Use this skill whenever the user names NexBrowser or needs to manage or automate a live NexBrowser session through the unified NexBrowser MCP tools.

## When to Use

- The user explicitly says NexBrowser/nexbrowser, NexBrowser OpenAPI, “使用 NexBrowser”, “查看有多少窗口”, “查询环境”, or “浏览器环境”.
- The user wants to list or count managed NexBrowser windows/environments/profiles. Call `nex_browser_list`; do not inspect Chrome, Edge, the Codex in-app browser, operating-system windows, processes, or tabs.
- The user wants to control a browser: navigate, click, type, scroll, upload, or scrape.
- The task needs element targets from an accessibility snapshot.
- The task needs help diagnosing a browser-automation failure.

## Quick Decision Matrix

| User intent             | Tool                                                                               | Notes                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| List/count environments | `nex_browser_list`                                                                 | NexBrowser managed windows only; never OS windows or tabs.                                                       |
| Import custom proxies   | `nex_proxy_import`                                                                 | Only with proxy lines the user pasted in the current request; credentials are never returned.                    |
| List proxies            | `nex_proxy_list`                                                                   | Select a proxyId for create or bind; credentials are never returned.                                             |
| Bind a proxy            | `nex_browser_bind_proxy`                                                           | Closed windows only; `proxyId=0` removes the binding.                                                            |
| Create environments     | `nex_browser_create`                                                               | Desktop defaults fill every field you omit; only override on request.                                            |
| Open environments       | `nex_browser_open`                                                                 | Pass all target IDs in one array when opening multiple windows.                                                  |
| Connect to NexBrowser   | `nex_browser_connect`                                                              | Requires a managed window ID; the active team is used by default.                                                |
| Navigate to a URL       | `nex_browser_navigate`                                                             | Use for an initial or explicitly supplied URL.                                                                   |
| Inspect elements        | `nex_browser_snapshot`                                                             | Preferred over a screenshot for interaction.                                                                     |
| Click, type, or select  | `nex_browser_click`, `nex_browser_type`, `nex_browser_select_option`               | Use snapshot `target` values.                                                                                    |
| Sign in to a platform   | `nex_browser_accounts`, `nex_browser_fill_account`, `nex_browser_fill_credentials` | Prefer a stored vault credential; use literal values only when the user explicitly supplies or asks to use them. |
| Wait for a page change  | `nex_browser_wait_for`                                                             | Prefer `text` with `timeout` over fixed `time`.                                                                  |
| Read structured data    | `nex_browser_evaluate`                                                             | Prefer UI tools for state-changing actions.                                                                      |
| Inspect visual state    | `nex_browser_take_screenshot`                                                      | Use when layout or rendered media matters.                                                                       |
| Debug failures          | `nex_browser_console_messages`, `nex_browser_network_requests`                     | Inspect after reproducing the issue.                                                                             |

## Critical Rules

- Treat the NexBrowser product name as an explicit routing request for this MCP server. Never substitute generic Browser/Chrome plugins, computer-use, shell commands, or process enumeration.
- For one window, connect with `nex_browser_connect`; set `startIfNeeded=true` only when the user also wants the stopped window opened.
- For multiple windows, call `nex_browser_open` exactly once with every target ID in the `windowId` array. Wait for its per-window results, then call `nex_browser_connect(startIfNeeded=false)` once for each successfully opened window. Never use repeated `nex_browser_connect(startIfNeeded=true)` calls to launch a multi-window task.
- Retain every returned `sessionId` and pass it explicitly to subsequent tools for that window. The implicit active session only identifies the most recently connected window.
- If Desktop reports a per-client session-limit error, process windows in bounded waves: connect only up to the allowed limit, finish and disconnect those sessions, then continue with the next wave. Do not reopen windows between waves.
- Pass `teamId` only when it is already known. Never pass a raw CDP endpoint.
- Call `nex_browser_snapshot` before the first target-based interaction and use its ref, such as `target: "e48"`; a unique CSS selector is a fallback. Multiple actions may reuse the same snapshot only while the page structure remains stable.
- Snapshot refs are temporary. Re-snapshot after navigation, an action that changes the DOM, a substantial asynchronous update, or any stale-reference error.
- Prefer visible controls: click links, buttons, filters, and pagination before using direct navigation or JavaScript.
- For sensitive flows such as login, upload, checkout, or account changes, slow down: operate visible controls step by step, verify each result, and preserve confirmation steps (see `guides/human-like-interaction.md`).
- To sign in with a stored credential, open and connect the window, call `nex_browser_accounts` for an `accountId`, then call `nex_browser_fill_account` with that ID only. The vault plugin chooses visible fields and keeps passwords and 2FA secrets outside MCP. Call it again after each navigation in a multi-step sign-in. Never type a stored credential with `nex_browser_type` or `nex_browser_fill_form`, and never repeat one back. The tool does not submit; click the visible submit control yourself after verifying the filled state.
- Use `nex_browser_fill_credentials` only when the user explicitly supplies literal credentials in the current request or explicitly asks you to use them. Treat a login account, password, TOTP retrieval URL, recovery email, recovery-email password, and email login URL supplied together as one ephemeral credential bundle. Do not persist a bundle, and do not assign multiple bundles to windows unless the mapping is explicit. Literal values enter the model and MCP request boundary: never store, log, or repeat them in a response. The tool fills only current visible targets and never submits; snapshot each changed step before filling.
- If a sign-in requests a code available at a user-supplied retrieval URL, retain the login page ID, open the URL in a temporary tab, and accept a code only when exactly one current code is unambiguous. Close the temporary tab, reselect the login page, snapshot again, and fill the code with `nex_browser_fill_credentials`. A user-supplied retrieval URL is the only allowed URL exception for embedded secret material; never copy it into prose or logs.
- If a sign-in requires a recovery-email code, open the explicitly supplied email login URL in a temporary tab and fill the explicitly supplied email address and password only with `nex_browser_fill_credentials`. Accept only one message/code that is clearly tied to the current sign-in. Stop on CAPTCHA, human confirmation, device approval, SMS challenge, an ambiguous code, or an inaccessible page. Close the email tab before returning to the retained login page. See [Sign-in with literal credentials](examples/sign-in-with-literal-credentials.md).
- Wait and verify after every state-changing action. Prefer observable text waits over fixed delays.
- Treat `nex_browser_evaluate` as an inspection and extraction tool; use it to change page state only when the normal UI cannot be operated. `nex_browser_evaluate` and `nex_browser_run_code` are permission-gated by the NexBrowser Desktop app.

## Starter Workflow

Single window:

```text
1. nex_browser_connect(windowId="WINDOW_ID", startIfNeeded=true)
2. nex_browser_navigate(url="https://example.com")
3. nex_browser_wait_for(text="expected content")   # or time=2000 (milliseconds) as a fallback
4. nex_browser_snapshot()
```

Multiple windows:

```text
1. nex_browser_open(teamId="TEAM_ID", windowId=["WINDOW_1", "WINDOW_2", "WINDOW_3"])
2. nex_browser_connect(windowId="WINDOW_1", startIfNeeded=false) -> retain SESSION_1
3. nex_browser_connect(windowId="WINDOW_2", startIfNeeded=false) -> retain SESSION_2
4. nex_browser_connect(windowId="WINDOW_3", startIfNeeded=false) -> retain SESSION_3
5. Call automation tools with the matching explicit sessionId.
```

## Out of Scope

Do not invent tools for the following — they are outside this skill's scope; route the user instead:

- Deleting or editing existing browser environments/profiles or resetting fingerprints — not available through this MCP server; direct the user to the NexBrowser app. Creating new environments is available through `nex_browser_create`. Importing user-supplied proxy lines uses `nex_proxy_import`; binding or removing a proxy on a closed window uses `nex_browser_bind_proxy`.
- Creating, editing, or reading credential secrets — `nex_browser_accounts` only reports autofill-capable vault entries for an open window, with masked usernames and no secrets. Managing the entries themselves belongs in the NexBrowser app.
- Creating, editing, or persisting credentials in Desktop is account management and remains out of scope. Literal credential filling is one-time form filling only; it does not create or manage an account.
- Raw CDP or WebSocket connections — never pass a CDP endpoint to an automation tool; `nex_browser_connect` with a `windowId` is the only automation entry point. Environment-management tools redact CDP endpoints by default; the operator-only `NEX_EXPOSE_CDP=1` mode is outside this skill workflow.
- Cookie export, UA queries, or profile sharing — not part of this tool set.
- Environment lifecycle (`nex_browser_list`, `nex_browser_create`, `nex_browser_open`, `nex_browser_close`, `nex_browser_connection_info`, `nex_browser_accounts`) manages windows only; it cannot automate pages. Page automation always requires `nex_browser_connect` first.
- Proxy IP catalog lookup, quoting, purchasing, payment confirmation, and order-status checks are not part of this tool set; direct the user to the Proxy IP page in NexBrowser Desktop.

## Progressive Disclosure

| Reference                                                                        | When to use                                                                            |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [Tool catalog](references/tool-catalog.md)                                       | Confirm a tool's exact name, inputs, and read-only status.                             |
| [Tool selection](guides/tool-selection.md)                                       | Unsure which interaction tool fits the intent.                                         |
| [Snapshot modes](guides/snapshot-modes.md)                                       | Targets are stale or snapshots are too large.                                          |
| [Waiting and timing](guides/waiting-and-timing.md)                               | Flaky results after navigation or slow pages.                                          |
| [Human-like interaction](guides/human-like-interaction.md)                       | Sensitive flows needing cautious pacing.                                               |
| [Error handling](guides/error-handling.md)                                       | A tool returned an error and the hint is not enough.                                   |
| [Examples](examples/connect-and-navigate.md)                                     | Full workflow templates for common tasks.                                              |
| [Sign-in with a bound account](examples/sign-in-with-bound-account.md)           | The task needs a platform login for a window.                                          |
| [Sign-in with literal credentials](examples/sign-in-with-literal-credentials.md) | The user explicitly provides credentials and a one-time retrieval-code flow is needed. |

## NexBrowser Integration

Discover the target `windowId` with `nex_browser_list`, which is part of this same MCP server, then connect with `nex_browser_connect` and use this skill for live automation. The NexBrowser Desktop app validates ownership and resolves the browser connection internally.

`teamId` scopes browser discovery and lifecycle operations to a NexBrowser Team. When it is omitted
from tools that allow omission, Desktop uses the currently selected Team. This MCP does not list or
modify Teams or Projects, so never invent a `teamId`; use an ID already supplied by the user or
Desktop context.
